#include "pch.h"
#include "GumpLocalStorage.h"

#include <ShlObj.h>
#include <combaseapi.h>
#include <MemoryBuffer.h>
#include <cstdio>
#include <stdexcept>

#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Graphics.Imaging.h>
#include <winrt/Windows.Media.FaceAnalysis.h>
#include <winrt/Windows.Security.Cryptography.h>
#include <winrt/Windows.Storage.h>
#include <winrt/Windows.Storage.FileProperties.h>
#include <winrt/Windows.Storage.Streams.h>
#include <winrt/Windows.Web.Http.h>
#include <winrt/Windows.Web.Http.Headers.h>

#include <algorithm>
#include <cmath>
#include <condition_variable>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <mutex>
#include <optional>
#include <thread>
#include <vector>

namespace winrtRN = winrt::Microsoft::ReactNative;
using namespace winrt::Windows::Graphics::Imaging;
using namespace winrt::Windows::Media::FaceAnalysis;
using namespace winrt::Windows::Security::Cryptography;
using namespace winrt::Windows::Storage;
using namespace winrt::Windows::Storage::FileProperties;
using namespace winrt::Windows::Storage::Streams;
using namespace winrt::Windows::Web::Http;

namespace {

using ReactPromiseJS = winrtRN::ReactPromise<winrtRN::JSValue>;

constexpr uint32_t kThumbnailMaxPixelSize = 768;
constexpr float kThumbnailJpegQuality = 0.80f;
constexpr int kThumbnailMaxConcurrent = 4;
constexpr float kFaceCropSidePadding = 0.3f;
constexpr float kFaceCropTopPadding = 0.3f;
constexpr float kFaceCropBottomPadding = 0.5f;
constexpr uint32_t kFaceCropOutputPixelSize = 128;
constexpr float kFaceCropJpegQuality = 0.85f;

std::wstring ToWide(std::string_view value) {
  if (value.empty()) {
    return {};
  }
  const int size = MultiByteToWideChar(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), nullptr, 0);
  std::wstring wide(size, L'\0');
  MultiByteToWideChar(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), wide.data(), size);
  return wide;
}

std::string ToUtf8(std::wstring_view value) {
  if (value.empty()) {
    return {};
  }
  const int size = WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
  std::string utf8(size, '\0');
  WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), utf8.data(), size, nullptr, nullptr);
  return utf8;
}

std::filesystem::path PathFromUri(std::string_view uri) {
  if (uri.empty()) {
    return {};
  }

  std::string_view pathPart = uri;
  if (uri.rfind("file://", 0) == 0) {
    pathPart = uri.substr(7);
    // file:///C:\path and file:///C:/path both need the leading slash removed
    // before Windows can resolve the drive letter path.
    if (pathPart.size() >= 3 && pathPart[0] == '/' && pathPart[2] == ':') {
      const char drive = pathPart[1];
      if ((drive >= 'A' && drive <= 'Z') || (drive >= 'a' && drive <= 'z')) {
        pathPart.remove_prefix(1);
      }
    }
  }

  return std::filesystem::path(ToWide(pathPart));
}

std::filesystem::path CullingAlbumDirectory(std::string_view albumId) {
  PWSTR localAppData = nullptr;
  SHGetKnownFolderPath(FOLDERID_LocalAppData, 0, nullptr, &localAppData);
  std::filesystem::path base(localAppData);
  CoTaskMemFree(localAppData);
  return base / "Gump" / "culling-albums" / std::filesystem::path(ToWide(albumId));
}

std::filesystem::path ThumbnailDirectory(std::string_view albumId) {
  return CullingAlbumDirectory(albumId) / L"thumbs";
}

std::filesystem::path ThumbnailPathForAlbum(std::string_view albumId, std::string_view photoId) {
  return ThumbnailDirectory(albumId) / (ToWide(photoId) + L".jpg");
}

std::filesystem::path FaceCropDirectory(std::string_view albumId) {
  return CullingAlbumDirectory(albumId) / L"face-thumbs";
}

std::filesystem::path FaceCropPathForAlbum(
    std::string_view albumId,
    std::string_view photoId,
    int faceIndex) {
  return FaceCropDirectory(albumId) / (ToWide(photoId) + L"-" + std::to_wstring(faceIndex) + L".jpg");
}

struct FaceCropRect {
  int left{0};
  int top{0};
  int width{0};
  int height{0};
};

FaceCropRect ComputePaddedFaceCropRect(
    int imageWidth,
    int imageHeight,
    float boxLeft,
    float boxTop,
    float boxWidth,
    float boxHeight) {
  const float cropX = boxLeft * static_cast<float>(imageWidth);
  const float cropY = boxTop * static_cast<float>(imageHeight);
  const float cropW = std::max(boxWidth * static_cast<float>(imageWidth), 1.0f);
  const float cropH = std::max(boxHeight * static_cast<float>(imageHeight), 1.0f);

  float viewLeft = cropX - kFaceCropSidePadding * cropW;
  float viewTop = cropY - kFaceCropTopPadding * cropH;
  float viewW = cropW * (1.0f + 2.0f * kFaceCropSidePadding);
  float viewH = cropH * (1.0f + kFaceCropTopPadding + kFaceCropBottomPadding);

  viewLeft = std::max(0.0f, std::min(viewLeft, static_cast<float>(imageWidth - 1)));
  viewTop = std::max(0.0f, std::min(viewTop, static_cast<float>(imageHeight - 1)));
  viewW = std::max(1.0f, std::min(viewW, static_cast<float>(imageWidth) - viewLeft));
  viewH = std::max(1.0f, std::min(viewH, static_cast<float>(imageHeight) - viewTop));

  return FaceCropRect{
      static_cast<int>(std::lround(viewLeft)),
      static_cast<int>(std::lround(viewTop)),
      static_cast<int>(std::lround(viewW)),
      static_cast<int>(std::lround(viewH)),
  };
}

StorageFile GetStorageFileFromPath(const std::filesystem::path &path) {
  return StorageFile::GetFileFromPathAsync(path.wstring()).get();
}

bool WriteBytesToPath(const std::filesystem::path &path, const std::vector<uint8_t> &bytes) {
  std::filesystem::create_directories(path.parent_path());

  const std::wstring tempPath = path.wstring() + L"." + std::to_wstring(GetCurrentProcessId()) +
                                L"-" + std::to_wstring(GetTickCount64()) + L".tmp";

  HANDLE file = CreateFileW(
      tempPath.c_str(),
      GENERIC_WRITE,
      FILE_SHARE_READ,
      nullptr,
      CREATE_ALWAYS,
      FILE_ATTRIBUTE_NORMAL,
      nullptr);
  if (file == INVALID_HANDLE_VALUE) {
    return false;
  }

  DWORD written = 0;
  const BOOL writeOk = WriteFile(
      file,
      bytes.data(),
      static_cast<DWORD>(bytes.size()),
      &written,
      nullptr);
  FlushFileBuffers(file);
  CloseHandle(file);

  if (!writeOk || written != bytes.size()) {
    DeleteFileW(tempPath.c_str());
    return false;
  }

  if (MoveFileExW(tempPath.c_str(), path.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
    return true;
  }

  if (CopyFileW(tempPath.c_str(), path.c_str(), FALSE)) {
    DeleteFileW(tempPath.c_str());
    return true;
  }

  DeleteFileW(tempPath.c_str());
  return false;
}

std::vector<uint8_t> EncodeSoftwareBitmapJpeg(
    const SoftwareBitmap &bitmap,
    float quality,
    std::optional<uint32_t> scaledWidth = std::nullopt,
    std::optional<uint32_t> scaledHeight = std::nullopt) {
  InMemoryRandomAccessStream memoryStream;
  BitmapPropertySet encodingOptions;
  encodingOptions.Insert(
      L"ImageQuality",
      BitmapTypedValue(
          winrt::box_value(quality),
          winrt::Windows::Foundation::PropertyType::Single));

  const auto encoder =
      BitmapEncoder::CreateAsync(BitmapEncoder::JpegEncoderId(), memoryStream, encodingOptions).get();
  encoder.SetSoftwareBitmap(bitmap);
  if (scaledWidth.has_value() && scaledHeight.has_value()) {
    auto transform = encoder.BitmapTransform();
    transform.ScaledWidth(*scaledWidth);
    transform.ScaledHeight(*scaledHeight);
    transform.InterpolationMode(BitmapInterpolationMode::Fant);
  }
  encoder.FlushAsync().get();

  const auto size = static_cast<uint32_t>(memoryStream.Size());
  DataReader reader(memoryStream.GetInputStreamAt(0));
  reader.LoadAsync(size).get();
  std::vector<uint8_t> bytes(size);
  reader.ReadBytes(bytes);
  return bytes;
}

bool WriteSoftwareBitmapJpeg(
    const SoftwareBitmap &bitmap,
    const std::filesystem::path &path,
    float quality,
    std::optional<uint32_t> scaledWidth = std::nullopt,
    std::optional<uint32_t> scaledHeight = std::nullopt) {
  try {
    const auto bytes = EncodeSoftwareBitmapJpeg(bitmap, quality, scaledWidth, scaledHeight);
    return WriteBytesToPath(path, bytes);
  } catch (...) {
    return false;
  }
}

std::filesystem::path ChooseWritablePath(const std::filesystem::path &desiredPath) {
  if (!std::filesystem::exists(desiredPath)) {
    return desiredPath;
  }

  HANDLE probe = CreateFileW(
      desiredPath.c_str(),
      GENERIC_WRITE,
      FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
      nullptr,
      OPEN_EXISTING,
      FILE_ATTRIBUTE_NORMAL,
      nullptr);
  if (probe != INVALID_HANDLE_VALUE) {
    CloseHandle(probe);
    return desiredPath;
  }

  return desiredPath.parent_path() /
         (desiredPath.stem().wstring() + L"-" + std::to_wstring(GetTickCount64()) +
          desiredPath.extension().wstring());
}

struct ThumbnailSize {
  uint32_t width{0};
  uint32_t height{0};
};

ThumbnailSize ComputeThumbnailSize(uint32_t sourceWidth, uint32_t sourceHeight, uint32_t maxPixelSize) {
  if (sourceWidth == 0 || sourceHeight == 0) {
    return {};
  }

  if (sourceWidth <= maxPixelSize && sourceHeight <= maxPixelSize) {
    return {sourceWidth, sourceHeight};
  }

  if (sourceWidth >= sourceHeight) {
    const auto scaledHeight = static_cast<uint32_t>(std::lround(
        static_cast<double>(sourceHeight) * static_cast<double>(maxPixelSize) /
        static_cast<double>(sourceWidth)));
    return {maxPixelSize, std::max(1u, scaledHeight)};
  }

  const auto scaledWidth = static_cast<uint32_t>(std::lround(
      static_cast<double>(sourceWidth) * static_cast<double>(maxPixelSize) /
      static_cast<double>(sourceHeight)));
  return {std::max(1u, scaledWidth), maxPixelSize};
}

class ThumbnailConcurrencyGuard {
 public:
  ThumbnailConcurrencyGuard() {
    std::unique_lock<std::mutex> lock(Mutex());
    Cv().wait(lock, [] { return Active() < kThumbnailMaxConcurrent; });
    ++Active();
  }

  ~ThumbnailConcurrencyGuard() {
    {
      std::lock_guard<std::mutex> lock(Mutex());
      --Active();
    }
    Cv().notify_one();
  }

 private:
  static std::mutex &Mutex() {
    static std::mutex mutex;
    return mutex;
  }

  static std::condition_variable &Cv() {
    static std::condition_variable cv;
    return cv;
  }

  static int &Active() {
    static int active = 0;
    return active;
  }
};

bool IsReusableThumbnailFile(const std::filesystem::path &thumbPath) {
  if (thumbPath.empty() || !std::filesystem::exists(thumbPath)) {
    return false;
  }

  try {
    const auto file = GetStorageFileFromPath(thumbPath);
    const auto stream = file.OpenAsync(FileAccessMode::Read).get();
    const auto decoder = BitmapDecoder::CreateAsync(stream).get();
    return decoder.OrientedPixelWidth() > 0 &&
           decoder.OrientedPixelHeight() > 0 &&
           decoder.OrientedPixelWidth() <= kThumbnailMaxPixelSize &&
           decoder.OrientedPixelHeight() <= kThumbnailMaxPixelSize;
  } catch (...) {
    return false;
  }
}

std::optional<std::filesystem::path> GenerateThumbnailAtPath(
    const std::filesystem::path &sourcePath,
    std::string_view albumId,
    std::string_view photoId) {
  ThumbnailConcurrencyGuard concurrencyGuard;

  if (sourcePath.empty() || !std::filesystem::exists(sourcePath)) {
    return std::nullopt;
  }

  const auto desiredThumbPath = ThumbnailPathForAlbum(albumId, photoId);
  std::filesystem::create_directories(desiredThumbPath.parent_path());

  const auto legacyOrientedPath =
      ThumbnailDirectory(albumId) / (ToWide(photoId) + L".o1.jpg");
  if (std::filesystem::exists(legacyOrientedPath)) {
    std::error_code ec;
    std::filesystem::remove(legacyOrientedPath, ec);
  }

  if (IsReusableThumbnailFile(desiredThumbPath)) {
    return desiredThumbPath;
  }

  auto decodeOrientedThumbnail = [&](const std::filesystem::path &decodePath) -> SoftwareBitmap {
    const auto sourceFile = GetStorageFileFromPath(decodePath);
    const auto sourceStream = sourceFile.OpenAsync(FileAccessMode::Read).get();
    const auto decoder = BitmapDecoder::CreateAsync(sourceStream).get();

    const auto targetSize = ComputeThumbnailSize(
        decoder.PixelWidth(), decoder.PixelHeight(), kThumbnailMaxPixelSize);
    if (targetSize.width == 0 || targetSize.height == 0) {
      return nullptr;
    }

    BitmapTransform transform;
    if (targetSize.width != decoder.PixelWidth() ||
        targetSize.height != decoder.PixelHeight()) {
      transform.ScaledWidth(targetSize.width);
      transform.ScaledHeight(targetSize.height);
      transform.InterpolationMode(BitmapInterpolationMode::Linear);
    }

    return decoder
        .GetSoftwareBitmapAsync(
            BitmapPixelFormat::Bgra8,
            BitmapAlphaMode::Premultiplied,
            transform,
            ExifOrientationMode::RespectExifOrientation,
            ColorManagementMode::DoNotColorManage)
        .get();
  };

  SoftwareBitmap bitmap{nullptr};
  try {
    bitmap = decodeOrientedThumbnail(sourcePath);
  } catch (...) {
    const auto tempSource =
        std::filesystem::temp_directory_path() /
        (L"gump-thumb-src-" + std::to_wstring(GetTickCount64()) + sourcePath.extension().wstring());
    if (!CopyFileW(sourcePath.c_str(), tempSource.c_str(), FALSE)) {
      return std::nullopt;
    }
    try {
      bitmap = decodeOrientedThumbnail(tempSource);
    } catch (...) {
      DeleteFileW(tempSource.c_str());
      return std::nullopt;
    }
    DeleteFileW(tempSource.c_str());
  }

  if (!bitmap) {
    return std::nullopt;
  }

  const auto thumbPath = ChooseWritablePath(desiredThumbPath);
  if (!WriteSoftwareBitmapJpeg(bitmap, thumbPath, kThumbnailJpegQuality)) {
    return std::nullopt;
  }

  return thumbPath;
}

std::string FileUri(const std::filesystem::path &path) {
  auto utf8 = ToUtf8(path.wstring());
  for (char &ch : utf8) {
    if (ch == '\\') {
      ch = '/';
    }
  }
  return "file:///" + utf8;
}

std::string MimeTypeForPath(const std::filesystem::path &path) {
  const auto ext = path.extension().wstring();
  if (ext.empty()) {
    return "image/jpeg";
  }
  return "public." + ToUtf8(ext.substr(1));
}

int64_t ToUnixMillis(winrt::Windows::Foundation::DateTime const &value) {
  return (value.time_since_epoch().count() - 116444736000000000LL) / 10000LL;
}

std::optional<double> ReadCaptureTimestampMillis(const std::filesystem::path &path) {
  const auto file = GetStorageFileFromPath(path);
  const auto properties = file.Properties().GetImagePropertiesAsync().get();
  const auto dateTaken = properties.DateTaken();
  if (dateTaken == winrt::Windows::Foundation::DateTime{}) {
    return std::nullopt;
  }
  return static_cast<double>(ToUnixMillis(dateTaken));
}

winrtRN::JSValueObject EyesOpenFromScore(float minOpen, float maxOpen, float avgOpen) {
  const float openThreshold = 0.58f;
  const float openMinThreshold = 0.48f;
  const float closedMaxThreshold = 0.36f;
  const float closedAvgThreshold = 0.32f;

  winrtRN::JSValueObject eyesOpen;
  if (avgOpen >= openThreshold && minOpen >= openMinThreshold) {
    eyesOpen["value"] = true;
    eyesOpen["confidence"] = std::min(98.0, 86.0 + (avgOpen - openThreshold) * 200.0);
  } else if (maxOpen <= closedMaxThreshold || avgOpen <= closedAvgThreshold) {
    eyesOpen["value"] = false;
    eyesOpen["confidence"] = std::min(98.0, 86.0 + (closedMaxThreshold - maxOpen) * 400.0);
  } else if (avgOpen < 0.45f && maxOpen < 0.52f) {
    eyesOpen["value"] = false;
    eyesOpen["confidence"] = 88.0;
  } else {
    eyesOpen["value"] = false;
    eyesOpen["confidence"] = 72.0;
  }
  return eyesOpen;
}

float EstimateEyeOpenness(
    const uint8_t *pixels,
    int width,
    int height,
    int stride,
    int left,
    int top,
    int regionWidth,
    int regionHeight) {
  const int safeLeft = std::max(0, left);
  const int safeTop = std::max(0, top);
  const int safeRight = std::min(width, safeLeft + std::max(1, regionWidth));
  const int safeBottom = std::min(height, safeTop + std::max(1, regionHeight));
  const int rows = safeBottom - safeTop;
  const int cols = safeRight - safeLeft;
  if (rows < 4 || cols < 4) {
    return 0.5f;
  }

  auto grayAt = [&](int px, int py) {
    const int pixelIndex = py * stride + px * 4;
    return pixels[pixelIndex] * 0.299 + pixels[pixelIndex + 1] * 0.587 + pixels[pixelIndex + 2] * 0.114;
  };

  std::vector<double> rowMean(static_cast<size_t>(rows), 0.0);
  for (int y = 0; y < rows; ++y) {
    double sum = 0.0;
    for (int x = safeLeft; x < safeRight; ++x) {
      sum += grayAt(x, safeTop + y);
    }
    rowMean[static_cast<size_t>(y)] = sum / static_cast<double>(cols);
  }

  const int topEnd = std::max(1, rows / 4);
  const int bottomStart = rows - topEnd;
  const int midStart = topEnd;
  const int midEnd = std::max(midStart + 1, bottomStart);

  double topSum = 0.0;
  double midSum = 0.0;
  double bottomSum = 0.0;
  for (int y = 0; y < topEnd; ++y) {
    topSum += rowMean[static_cast<size_t>(y)];
  }
  for (int y = midStart; y < midEnd; ++y) {
    midSum += rowMean[static_cast<size_t>(y)];
  }
  for (int y = bottomStart; y < rows; ++y) {
    bottomSum += rowMean[static_cast<size_t>(y)];
  }

  const double topMean = topSum / static_cast<double>(topEnd);
  const double midMean = midSum / static_cast<double>(midEnd - midStart);
  const double bottomMean = bottomSum / static_cast<double>(rows - bottomStart);
  const double lidMean = (topMean + bottomMean) * 0.5;
  const double darkness = std::max(0.0, (lidMean - midMean) / 255.0);
  const double darknessScore = std::max(0.0, std::min(1.0, darkness / 0.22));

  double verticalEdges = 0.0;
  double horizontalEdges = 0.0;
  int count = 0;
  for (int y = safeTop + 1; y < safeBottom - 1; ++y) {
    for (int x = safeLeft + 1; x < safeRight - 1; ++x) {
      const double gx = grayAt(x + 1, y) - grayAt(x - 1, y);
      const double gy = grayAt(x, y + 1) - grayAt(x, y - 1);
      verticalEdges += std::abs(gy);
      horizontalEdges += std::abs(gx);
      ++count;
    }
  }

  double edgeScore = 0.5;
  if (count > 0 && horizontalEdges >= 1e-6) {
    const double ratio = verticalEdges / horizontalEdges;
    edgeScore = std::max(0.0, std::min(1.0, (ratio - 0.35) / 0.9));
  }

  return static_cast<float>(std::max(0.0, std::min(1.0, 0.62 * darknessScore + 0.38 * edgeScore)));
}

float ComputeSharpness(const uint8_t *pixels, int width, int height, int stride, const BitmapBounds &box) {
  const int left = std::max(0, static_cast<int>(box.X));
  const int top = std::max(0, static_cast<int>(box.Y));
  const int right = std::min(width, left + static_cast<int>(box.Width));
  const int bottom = std::min(height, top + static_cast<int>(box.Height));
  if (right - left < 3 || bottom - top < 3) {
    return 30.0f;
  }

  double sum = 0.0;
  double sumSquared = 0.0;
  int count = 0;

  for (int y = top + 1; y < bottom - 1; ++y) {
    for (int x = left + 1; x < right - 1; ++x) {
      const auto grayAt = [&](int px, int py) {
        const int index = py * stride + px * 4;
        return pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
      };

      const double laplacian =
          -grayAt(x, y - 1) - grayAt(x - 1, y) + 4 * grayAt(x, y) - grayAt(x + 1, y) - grayAt(x, y + 1);
      sum += laplacian;
      sumSquared += laplacian * laplacian;
      ++count;
    }
  }

  if (count == 0) {
    return 30.0f;
  }

  const double mean = sum / count;
  const double variance = (sumSquared / count) - mean * mean;
  const float normalized = static_cast<float>(std::log(variance + 1.0) / std::log(1000.0) * 100.0);
  return std::max(0.0f, std::min(100.0f, normalized));
}

SoftwareBitmap LoadSoftwareBitmap(const std::filesystem::path &path) {
  const auto file = GetStorageFileFromPath(path);
  const auto stream = file.OpenAsync(FileAccessMode::Read).get();
  const auto decoder = BitmapDecoder::CreateAsync(stream).get();
  auto bitmap = decoder
                    .GetSoftwareBitmapAsync(
                        BitmapPixelFormat::Bgra8,
                        BitmapAlphaMode::Premultiplied,
                        BitmapTransform{},
                        ExifOrientationMode::RespectExifOrientation,
                        ColorManagementMode::DoNotColorManage)
                    .get();
  return bitmap;
}

struct BitmapPixels {
  std::vector<uint8_t> bytes;
  int width{0};
  int height{0};
  int stride{0};
};

BitmapPixels ReadBitmapPixels(const SoftwareBitmap &bitmap) {
  BitmapBuffer buffer = bitmap.LockBuffer(BitmapBufferAccessMode::Read);
  const auto reference = buffer.CreateReference();

  auto byteAccess = reference.as<::Windows::Foundation::IMemoryBufferByteAccess>();
  uint8_t* data = nullptr;
  uint32_t capacity = 0;
  winrt::check_hresult(byteAccess->GetBuffer(&data, &capacity));

  const auto plane = buffer.GetPlaneDescription(0);

  BitmapPixels result;
  result.width = bitmap.PixelWidth();
  result.height = bitmap.PixelHeight();
  result.stride = plane.Stride;
  result.bytes.assign(data + plane.StartIndex, data + plane.StartIndex + plane.Height * plane.Stride);
  return result;
}

std::optional<uint64_t> ComputeDifferenceHash(const std::filesystem::path &path) {
  const auto bitmap = LoadSoftwareBitmap(path);
  const auto pixels = ReadBitmapPixels(bitmap);
  const int srcWidth = pixels.width;
  const int srcHeight = pixels.height;
  if (srcWidth <= 0 || srcHeight <= 0) {
    return std::nullopt;
  }

  uint8_t gray[72]{};
  for (int y = 0; y < 8; ++y) {
    for (int x = 0; x < 9; ++x) {
      const double sourceX = (x + 0.5) * srcWidth / 9.0 - 0.5;
      const double sourceY = (y + 0.5) * srcHeight / 8.0 - 0.5;
      const int pixelX = std::clamp(static_cast<int>(std::round(sourceX)), 0, srcWidth - 1);
      const int pixelY = std::clamp(static_cast<int>(std::round(sourceY)), 0, srcHeight - 1);
      const int index = pixelY * pixels.stride + pixelX * 4;
      gray[y * 9 + x] = static_cast<uint8_t>(
          pixels.bytes[index] * 0.299 + pixels.bytes[index + 1] * 0.587 + pixels.bytes[index + 2] * 0.114);
    }
  }

  uint64_t hash = 0;
  int bit = 0;
  for (int y = 0; y < 8; ++y) {
    for (int x = 0; x < 8; ++x) {
      if (gray[y * 9 + x] > gray[y * 9 + x + 1]) {
        hash |= (1ULL << (63 - bit));
      }
      ++bit;
    }
  }
  return hash;
}

std::string FormatHashHex(uint64_t hash) {
  char buffer[17]{};
  std::snprintf(buffer, sizeof(buffer), "%016llx", static_cast<unsigned long long>(hash));
  return buffer;
}

constexpr float kFaceBoxIoUThreshold = 0.50f;
constexpr float kTileOverlapFraction = 0.25f;
constexpr int kMinFacesToSkipTiling = 2;
constexpr int kMinPixelsForTiling = 4000000;

struct NormalizedFaceBox {
  float left{0.0f};
  float top{0.0f};
  float width{0.0f};
  float height{0.0f};
};

NormalizedFaceBox ToNormalizedFaceBox(const BitmapBounds &box, int imageWidth, int imageHeight) {
  return NormalizedFaceBox{
      static_cast<float>(box.X) / static_cast<float>(imageWidth),
      static_cast<float>(box.Y) / static_cast<float>(imageHeight),
      static_cast<float>(box.Width) / static_cast<float>(imageWidth),
      static_cast<float>(box.Height) / static_cast<float>(imageHeight),
  };
}

float IntersectionOverUnion(const NormalizedFaceBox &a, const NormalizedFaceBox &b) {
  const float intersectLeft = std::max(a.left, b.left);
  const float intersectTop = std::max(a.top, b.top);
  const float intersectRight = std::min(a.left + a.width, b.left + b.width);
  const float intersectBottom = std::min(a.top + a.height, b.top + b.height);
  const float intersectWidth = std::max(0.0f, intersectRight - intersectLeft);
  const float intersectHeight = std::max(0.0f, intersectBottom - intersectTop);
  const float intersection = intersectWidth * intersectHeight;
  if (intersection <= 0.0f) {
    return 0.0f;
  }

  const float unionArea = a.width * a.height + b.width * b.height - intersection;
  if (unionArea <= 0.0f) {
    return 0.0f;
  }
  return intersection / unionArea;
}

std::vector<BitmapBounds> DeduplicateFaceBoxes(
    const std::vector<BitmapBounds> &boxes,
    int imageWidth,
    int imageHeight) {
  if (boxes.size() <= 1) {
    return boxes;
  }

  std::vector<BitmapBounds> sorted = boxes;
  std::sort(sorted.begin(), sorted.end(), [](const BitmapBounds &left, const BitmapBounds &right) {
    return (left.Width * left.Height) > (right.Width * right.Height);
  });

  std::vector<BitmapBounds> kept;
  for (const auto &candidate : sorted) {
    const auto candidateNormalized = ToNormalizedFaceBox(candidate, imageWidth, imageHeight);
    const bool overlapsExisting = std::any_of(kept.begin(), kept.end(), [&](const BitmapBounds &existing) {
      return IntersectionOverUnion(candidateNormalized, ToNormalizedFaceBox(existing, imageWidth, imageHeight)) >=
             kFaceBoxIoUThreshold;
    });
    if (!overlapsExisting) {
      kept.push_back(candidate);
    }
  }
  return kept;
}

SoftwareBitmap CropSoftwareBitmap(
    const SoftwareBitmap &source,
    const BitmapPixels &sourcePixels,
    int originX,
    int originY,
    int cropWidth,
    int cropHeight) {
  SoftwareBitmap cropped(BitmapPixelFormat::Bgra8, cropWidth, cropHeight, BitmapAlphaMode::Premultiplied);
  BitmapBuffer destBuffer = cropped.LockBuffer(BitmapBufferAccessMode::Write);
  const auto destPlane = destBuffer.GetPlaneDescription(0);
  const auto destReference = destBuffer.CreateReference();

  auto destAccess = destReference.as<::Windows::Foundation::IMemoryBufferByteAccess>();
  uint8_t* destData = nullptr;
  uint32_t capacity = 0;
  winrt::check_hresult(destAccess->GetBuffer(&destData, &capacity));

  for (int y = 0; y < cropHeight; ++y) {
    const int sourceY = originY + y;
    const size_t sourceIndex = static_cast<size_t>(sourceY) * static_cast<size_t>(sourcePixels.stride) +
                               static_cast<size_t>(originX) * 4U;
    const size_t destIndex = static_cast<size_t>(y) * static_cast<size_t>(destPlane.Stride);
    std::memcpy(destData + destIndex, sourcePixels.bytes.data() + sourceIndex, static_cast<size_t>(cropWidth) * 4U);
  }

  return cropped;
}

std::optional<std::filesystem::path> SaveFaceCropJpeg(
    const SoftwareBitmap &cropped,
    const std::filesystem::path &path) {
  const auto outPath = ChooseWritablePath(path);
  if (!WriteSoftwareBitmapJpeg(
          cropped,
          outPath,
          kFaceCropJpegQuality,
          kFaceCropOutputPixelSize,
          kFaceCropOutputPixelSize)) {
    return std::nullopt;
  }
  return outPath;
}

void DeleteFaceCropsForPhoto(const std::filesystem::path &albumDir, std::string_view photoId) {
  const auto faceCropDir = albumDir / L"face-thumbs";
  if (!std::filesystem::exists(faceCropDir)) {
    return;
  }

  const auto prefix = ToWide(photoId) + L"-";
  for (const auto &entry : std::filesystem::directory_iterator(faceCropDir)) {
    if (entry.path().filename().wstring().rfind(prefix, 0) == 0) {
      std::filesystem::remove(entry.path());
    }
  }
}

winrtRN::JSValue GenerateFaceCropsAtPath(
    const std::filesystem::path &sourcePath,
    std::string_view albumId,
    std::string_view photoId,
    const winrtRN::JSValueArray &faces) {
  winrtRN::JSValueArray cropUris;
  if (sourcePath.empty() || !std::filesystem::exists(sourcePath) || faces.size() == 0) {
    return winrtRN::JSValueObject{{"cropUris", std::move(cropUris)}};
  }

  const auto bitmap = LoadSoftwareBitmap(sourcePath);
  const int imageWidth = bitmap.PixelWidth();
  const int imageHeight = bitmap.PixelHeight();
  if (imageWidth <= 0 || imageHeight <= 0) {
    return winrtRN::JSValueObject{{"cropUris", std::move(cropUris)}};
  }

  const auto sourcePixels = ReadBitmapPixels(bitmap);
  cropUris.reserve(faces.size());

  for (const auto &faceValue : faces) {
    if (faceValue.Type() != winrtRN::JSValueType::Object) {
      cropUris.push_back(nullptr);
      continue;
    }

    const auto &faceObject = faceValue.AsObject();
    const auto &faceIndexValue = faceObject["faceIndex"];
    const auto &boundingBoxValue = faceObject["boundingBox"];
    if (faceIndexValue.IsNull() || boundingBoxValue.Type() != winrtRN::JSValueType::Object) {
      cropUris.push_back(nullptr);
      continue;
    }

    const auto &boundingBox = boundingBoxValue.AsObject();
    const int faceIndex = static_cast<int>(faceIndexValue.AsInt32());
    const auto cropRect = ComputePaddedFaceCropRect(
        imageWidth,
        imageHeight,
        static_cast<float>(boundingBox["left"].AsDouble()),
        static_cast<float>(boundingBox["top"].AsDouble()),
        static_cast<float>(boundingBox["width"].AsDouble()),
        static_cast<float>(boundingBox["height"].AsDouble()));

    const auto cropped = CropSoftwareBitmap(
        bitmap,
        sourcePixels,
        cropRect.left,
        cropRect.top,
        cropRect.width,
        cropRect.height);
    const auto cropPath = FaceCropPathForAlbum(albumId, photoId, faceIndex);
    const auto savedPath = SaveFaceCropJpeg(cropped, cropPath);
    if (!savedPath.has_value()) {
      cropUris.push_back(nullptr);
      continue;
    }

    cropUris.push_back(FileUri(*savedPath));
  }

  return winrtRN::JSValueObject{{"cropUris", std::move(cropUris)}};
}

std::vector<BitmapBounds> DetectFaceBoxesInBitmap(const FaceDetector &detector, const SoftwareBitmap &bitmap) {
  static std::mutex detectMutex;
  std::lock_guard<std::mutex> lock(detectMutex);
  const auto faces = detector.DetectFacesAsync(bitmap).get();
  std::vector<BitmapBounds> boxes;
  for (const auto &face : faces) {
    boxes.push_back(face.FaceBox());
  }
  return boxes;
}

std::vector<BitmapBounds> DetectTiledFaceBoxes(
    const FaceDetector &detector,
    const SoftwareBitmap &bitmap,
    const BitmapPixels &sourcePixels,
    int gridCount) {
  const int imageWidth = bitmap.PixelWidth();
  const int imageHeight = bitmap.PixelHeight();
  if (imageWidth <= 0 || imageHeight <= 0 || gridCount <= 0) {
    return {};
  }

  const int tileWidth = static_cast<int>(
      static_cast<float>(imageWidth) / static_cast<float>(gridCount) * (1.0f + kTileOverlapFraction));
  const int tileHeight = static_cast<int>(
      static_cast<float>(imageHeight) / static_cast<float>(gridCount) * (1.0f + kTileOverlapFraction));
  const int stepX = imageWidth / gridCount;
  const int stepY = imageHeight / gridCount;

  std::vector<BitmapBounds> merged;
  for (int row = 0; row < gridCount; ++row) {
    for (int col = 0; col < gridCount; ++col) {
      int originX = col * stepX;
      int originY = row * stepY;
      if (originX + tileWidth > imageWidth) {
        originX = std::max(0, imageWidth - tileWidth);
      }
      if (originY + tileHeight > imageHeight) {
        originY = std::max(0, imageHeight - tileHeight);
      }

      const auto tileBitmap = CropSoftwareBitmap(bitmap, sourcePixels, originX, originY, tileWidth, tileHeight);
      const auto tileFaces = DetectFaceBoxesInBitmap(detector, tileBitmap);
      for (const auto &tileFace : tileFaces) {
        merged.push_back(BitmapBounds{
            tileFace.X + originX,
            tileFace.Y + originY,
            tileFace.Width,
            tileFace.Height,
        });
      }
    }
  }

  return DeduplicateFaceBoxes(merged, imageWidth, imageHeight);
}

std::vector<BitmapBounds> CollectFaceBoxes(
    const FaceDetector &detector,
    const SoftwareBitmap &bitmap,
    const BitmapPixels &sourcePixels) {
  const int imageWidth = bitmap.PixelWidth();
  const int imageHeight = bitmap.PixelHeight();
  const int pixelCount = imageWidth * imageHeight;

  std::vector<BitmapBounds> combined = DetectFaceBoxesInBitmap(detector, bitmap);
  std::vector<BitmapBounds> deduped = DeduplicateFaceBoxes(combined, imageWidth, imageHeight);
  if (deduped.size() >= static_cast<size_t>(kMinFacesToSkipTiling) || pixelCount < kMinPixelsForTiling) {
    return deduped;
  }

  const auto tiledTwoByTwo = DetectTiledFaceBoxes(detector, bitmap, sourcePixels, 2);
  combined.insert(combined.end(), tiledTwoByTwo.begin(), tiledTwoByTwo.end());
  return DeduplicateFaceBoxes(combined, imageWidth, imageHeight);
}

bool IsAcceptableFaceBox(const BitmapBounds &box, int imageWidth, int imageHeight) {
  if (box.Width < 30 || box.Height < 30) {
    return false;
  }

  const float aspect =
      static_cast<float>(box.Width) / static_cast<float>(std::max(1U, box.Height));
  if (aspect < 0.35f || aspect > 1.8f) {
    return false;
  }

  const float areaFraction =
      (static_cast<float>(box.Width) * static_cast<float>(box.Height)) /
      (static_cast<float>(imageWidth) * static_cast<float>(imageHeight));
  if (areaFraction < 0.0003f) {
    return false;
  }

  return true;
}

winrtRN::JSValueObject BuildFaceObject(
    const BitmapBounds &box,
    int index,
    const uint8_t *pixelData,
    int imageWidth,
    int imageHeight,
    int stride) {
  const float left = static_cast<float>(box.X) / static_cast<float>(imageWidth);
  const float top = static_cast<float>(box.Y) / static_cast<float>(imageHeight);
  const float width = static_cast<float>(box.Width) / static_cast<float>(imageWidth);
  const float height = static_cast<float>(box.Height) / static_cast<float>(imageHeight);

  const int eyeTop = static_cast<int>(box.Y + box.Height * 0.22f);
  const int eyeHeight = static_cast<int>(box.Height * 0.16f);
  const int leftEyeLeft = static_cast<int>(box.X + box.Width * 0.16f);
  const int leftEyeWidth = static_cast<int>(box.Width * 0.24f);
  const int rightEyeLeft = static_cast<int>(box.X + box.Width * 0.60f);
  const int rightEyeWidth = static_cast<int>(box.Width * 0.24f);

  const float leftOpen = EstimateEyeOpenness(
      pixelData, imageWidth, imageHeight, stride, leftEyeLeft, eyeTop, leftEyeWidth, eyeHeight);
  const float rightOpen = EstimateEyeOpenness(
      pixelData, imageWidth, imageHeight, stride, rightEyeLeft, eyeTop, rightEyeWidth, eyeHeight);
  const float minOpen = std::min(leftOpen, rightOpen);
  const float maxOpen = std::max(leftOpen, rightOpen);
  const float avgOpen = (leftOpen + rightOpen) / 2.0f;
  const BitmapBounds leftEyeBox{
      static_cast<float>(leftEyeLeft),
      static_cast<float>(eyeTop),
      static_cast<float>(leftEyeWidth),
      static_cast<float>(eyeHeight),
  };
  const BitmapBounds rightEyeBox{
      static_cast<float>(rightEyeLeft),
      static_cast<float>(eyeTop),
      static_cast<float>(rightEyeWidth),
      static_cast<float>(eyeHeight),
  };
  const float leftSharp =
      ComputeSharpness(pixelData, imageWidth, imageHeight, stride, leftEyeBox);
  const float rightSharp =
      ComputeSharpness(pixelData, imageWidth, imageHeight, stride, rightEyeBox);
  const float sharpness = std::min(leftSharp, rightSharp);

  return winrtRN::JSValueObject{
      {"boundingBox",
       winrtRN::JSValueObject{
           {"left", static_cast<double>(left)},
           {"top", static_cast<double>(top)},
           {"width", static_cast<double>(width)},
           {"height", static_cast<double>(height)},
       }},
      {"eyesOpen", EyesOpenFromScore(minOpen, maxOpen, avgOpen)},
      {"sharpness", static_cast<double>(sharpness)},
      {"brightness", 60.0},
      {"landmarks",
       winrtRN::JSValueArray{
           winrtRN::JSValueObject{
               {"type", "eyeLeft"},
               {"x", static_cast<double>(left + width * 0.25f)},
               {"y", static_cast<double>(1.0f - (top + height * 0.32f))},
           },
           winrtRN::JSValueObject{
               {"type", "eyeRight"},
               {"x", static_cast<double>(left + width * 0.75f)},
               {"y", static_cast<double>(1.0f - (top + height * 0.32f))},
           },
           winrtRN::JSValueObject{
               {"type", "nose"},
               {"x", static_cast<double>(left + width * 0.5f)},
               {"y", static_cast<double>(1.0f - (top + height * 0.55f))},
           },
           winrtRN::JSValueObject{
               {"type", "mouth"},
               {"x", static_cast<double>(left + width * 0.5f)},
               {"y", static_cast<double>(1.0f - (top + height * 0.78f))},
           },
       }},
      {"pose", winrtRN::JSValueObject{{"pitch", 0.0}, {"roll", 0.0}, {"yaw", 0.0}}},
      {"faceId", "local-face-" + std::to_string(index)},
  };
}

FaceDetector GetCachedFaceDetector() {
  static std::once_flag once;
  static FaceDetector detector{nullptr};
  std::call_once(once, []() { detector = FaceDetector::CreateAsync().get(); });
  return detector;
}

winrtRN::JSValueArray DetectFaces(const std::filesystem::path &path) {
  const auto detector = GetCachedFaceDetector();
  const auto bitmap = LoadSoftwareBitmap(path);
  const auto pixels = ReadBitmapPixels(bitmap);
  const auto faceBoxes = CollectFaceBoxes(detector, bitmap, pixels);

  const int imageWidth = pixels.width;
  const int imageHeight = pixels.height;
  const int stride = pixels.stride;
  const uint8_t *pixelData = pixels.bytes.data();

  winrtRN::JSValueArray result;
  int index = 0;
  for (const auto &box : faceBoxes) {
    if (!IsAcceptableFaceBox(box, imageWidth, imageHeight)) {
      continue;
    }
    result.push_back(BuildFaceObject(box, index, pixelData, imageWidth, imageHeight, stride));
    ++index;
  }

  return result;
}

template <typename Work>
void RunAsync(Work &&work, ReactPromiseJS &&promise) {
  std::thread([work = std::forward<Work>(work), promise = std::move(promise)]() mutable {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);
    try {
      promise.Resolve(work());
    } catch (const winrt::hresult_error &error) {
      promise.Reject(winrtRN::ReactError{"Error", ToUtf8(error.message())});
    } catch (const std::exception &error) {
      promise.Reject(winrtRN::ReactError{"Error", error.what()});
    } catch (...) {
      promise.Reject("Unknown native error");
    }
  }).detach();
}

template <typename Work>
void RunAsyncBool(Work &&work, winrtRN::ReactPromise<bool> &&promise) {
  std::thread([work = std::forward<Work>(work), promise = std::move(promise)]() mutable {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);
    try {
      promise.Resolve(work());
    } catch (const winrt::hresult_error &error) {
      promise.Reject(winrtRN::ReactError{"Error", ToUtf8(error.message())});
    } catch (const std::exception &error) {
      promise.Reject(winrtRN::ReactError{"Error", error.what()});
    } catch (...) {
      promise.Reject("Unknown native error");
    }
  }).detach();
}

} // namespace

namespace GumpDesktop {

void GumpLocalStorage::DetectFacesForCulling(std::string uri, ReactPromiseJS &&promise) noexcept {
  RunAsync(
      [uri = std::move(uri)]() {
        const auto path = PathFromUri(uri);
        if (path.empty() || !std::filesystem::exists(path)) {
          throw std::runtime_error("Photo file not found");
        }
        auto faces = DetectFaces(path);
        return winrtRN::JSValue(std::move(faces));
      },
      std::move(promise));
}

void GumpLocalStorage::CopyPhoto(
    std::string albumId,
    std::string sourceUri,
    std::string fileName,
    std::string photoId,
    ReactPromiseJS &&promise) noexcept {
  RunAsync(
      [=]() {
        const auto sourcePath = PathFromUri(sourceUri);
        if (sourcePath.empty() || !std::filesystem::exists(sourcePath)) {
          throw std::runtime_error("Source file not found");
        }

        const auto albumDir = CullingAlbumDirectory(albumId);
        std::filesystem::create_directories(albumDir);

        const auto safeName = fileName.empty() ? "photo.jpg" : fileName;
        const auto extension = std::filesystem::path(ToWide(safeName)).extension();
        
        winrt::guid newGuid;
        winrt::check_hresult(CoCreateGuid(reinterpret_cast<GUID*>(&newGuid)));
        const auto destId =
          photoId.empty() ? winrt::to_string(winrt::to_hstring(newGuid)) : photoId;
        const auto destName = extension.empty() ? destId : destId + ToUtf8(extension.wstring());
        const auto destPath = albumDir / ToWide(destName);
        std::filesystem::copy_file(sourcePath, destPath, std::filesystem::copy_options::overwrite_existing);

        winrtRN::JSValueObject result{
            {"uri", FileUri(destPath)},
            {"name", destName},
            {"size", static_cast<double>(std::filesystem::file_size(destPath))},
            {"type", MimeTypeForPath(destPath)},
        };

        return winrtRN::JSValue(std::move(result));
      },
      std::move(promise));
}

void GumpLocalStorage::ListPhotos(std::string albumId, ReactPromiseJS &&promise) noexcept {
  RunAsync(
      [albumId = std::move(albumId)]() {
        const auto albumDir = CullingAlbumDirectory(albumId);
        winrtRN::JSValueArray files;
        if (!std::filesystem::exists(albumDir)) {
          return winrtRN::JSValue(std::move(files));
        }

        for (const auto &entry : std::filesystem::directory_iterator(albumDir)) {
          if (!entry.is_regular_file()) {
            continue;
          }
          const auto name = ToUtf8(entry.path().filename().wstring());
          if (!name.empty() && name[0] == '.') {
            continue;
          }
          if (name == "thumbs") {
            continue;
          }
          files.push_back(winrtRN::JSValueObject{
              {"uri", FileUri(entry.path())},
              {"name", name},
              {"size", static_cast<double>(entry.file_size())},
              {"type", MimeTypeForPath(entry.path())},
          });
        }

        return winrtRN::JSValue(std::move(files));
      },
      std::move(promise));
}

void GumpLocalStorage::ReadFileSlice(std::string uri, double start, double end, ReactPromiseJS &&promise) noexcept {
  RunAsync(
      [=]() {
        const auto path = PathFromUri(uri);
        if (path.empty() || !std::filesystem::exists(path)) {
          throw std::runtime_error("File not found");
        }

        const auto startOffset = static_cast<uint64_t>(start);
        const auto endOffset = static_cast<uint64_t>(end);
        if (endOffset < startOffset) {
          throw std::runtime_error("Invalid slice range");
        }

        const auto length = static_cast<size_t>(endOffset - startOffset);
        std::ifstream input(path, std::ios::binary);
        input.seekg(static_cast<std::streamoff>(startOffset));
        std::vector<uint8_t> buffer(length);
        input.read(reinterpret_cast<char *>(buffer.data()), static_cast<std::streamsize>(length));
        if (static_cast<size_t>(input.gcount()) != length) {
          throw std::runtime_error("Unexpected end of file while reading slice");
        }

        const auto dataBuffer = CryptographicBuffer::CreateFromByteArray(buffer);
        const auto encoded = CryptographicBuffer::EncodeToBase64String(dataBuffer);

        return winrtRN::JSValue(winrtRN::JSValueObject{
            {"data", ToUtf8(encoded.c_str())},
            {"size", static_cast<double>(length)},
        });
      },
      std::move(promise));
}

void GumpLocalStorage::UploadFilePart(
    std::string uri,
    double start,
    double end,
    std::string uploadUrl,
    ReactPromiseJS &&promise) noexcept {
  RunAsync(
      [=]() {
        const auto path = PathFromUri(uri);
        if (path.empty() || !std::filesystem::exists(path)) {
          throw std::runtime_error("File not found");
        }

        const auto startOffset = static_cast<uint64_t>(start);
        const auto endOffset = static_cast<uint64_t>(end);
        if (endOffset < startOffset) {
          throw std::runtime_error("Invalid slice range");
        }

        const auto length = static_cast<size_t>(endOffset - startOffset);
        std::ifstream input(path, std::ios::binary);
        input.seekg(static_cast<std::streamoff>(startOffset));
        std::vector<uint8_t> buffer(length);
        input.read(reinterpret_cast<char *>(buffer.data()), static_cast<std::streamsize>(length));
        if (static_cast<size_t>(input.gcount()) != length) {
          throw std::runtime_error("Unexpected end of file while reading slice");
        }

        HttpClient client;
        HttpBufferContent content(CryptographicBuffer::CreateFromByteArray(buffer));
        HttpRequestMessage request(HttpMethod::Put(), winrt::Windows::Foundation::Uri(ToWide(uploadUrl)));
        request.Content(content);
        const auto response = client.SendRequestAsync(request).get();
        const auto status = response.StatusCode();
        if (status < HttpStatusCode::Ok || status >= HttpStatusCode::MultipleChoices) {
          throw std::runtime_error("Upload part failed with HTTP " + std::to_string(static_cast<int>(status)));
        }

        const auto etag = response.Headers().Lookup(L"ETag");
        if (etag.empty()) {
          throw std::runtime_error("Missing ETag header");
        }

        auto cleaned = ToUtf8(etag.c_str());
        cleaned.erase(std::remove(cleaned.begin(), cleaned.end(), '"'), cleaned.end());
        return winrtRN::JSValue(winrtRN::JSValueObject{{"eTag", cleaned}});
      },
      std::move(promise));
}

void GumpLocalStorage::DeletePhoto(std::string uri, winrtRN::ReactPromise<bool> &&promise) noexcept {
  RunAsyncBool(
      [uri = std::move(uri)]() {
        const auto path = PathFromUri(uri);
        if (path.empty()) {
          return true;
        }
        if (std::filesystem::exists(path)) {
          std::filesystem::remove(path);
        }

        const auto albumDir = path.parent_path();
        const auto photoId = path.stem().string();
        DeleteFaceCropsForPhoto(albumDir, photoId);

        const auto thumbsDir = albumDir / L"thumbs";
        const auto thumbPath = thumbsDir / (path.stem().wstring() + L".jpg");
        if (std::filesystem::exists(thumbPath)) {
          std::filesystem::remove(thumbPath);
        }
        const auto legacyOrientedThumb =
            thumbsDir / (path.stem().wstring() + L".o1.jpg");
        if (std::filesystem::exists(legacyOrientedThumb)) {
          std::filesystem::remove(legacyOrientedThumb);
        }

        return true;
      },
      std::move(promise));
}

void GumpLocalStorage::DeleteAlbum(std::string albumId, winrtRN::ReactPromise<bool> &&promise) noexcept {
  RunAsyncBool(
      [albumId = std::move(albumId)]() {
        const auto albumDir = CullingAlbumDirectory(albumId);
        if (std::filesystem::exists(albumDir)) {
          std::filesystem::remove_all(albumDir);
        }
        return true;
      },
      std::move(promise));
}

void GumpLocalStorage::GetImageDimensions(std::string uri, ReactPromiseJS &&promise) noexcept {
  RunAsync(
      [uri = std::move(uri)]() {
        const auto path = PathFromUri(uri);
        if (path.empty() || !std::filesystem::exists(path)) {
          throw std::runtime_error("Photo file not found");
        }

        const auto file = GetStorageFileFromPath(path);
        const auto stream = file.OpenAsync(FileAccessMode::Read).get();
        const auto decoder = BitmapDecoder::CreateAsync(stream).get();
        return winrtRN::JSValue(winrtRN::JSValueObject{
            {"width", static_cast<double>(decoder.OrientedPixelWidth())},
            {"height", static_cast<double>(decoder.OrientedPixelHeight())},
        });
      },
      std::move(promise));
}

void GumpLocalStorage::GetThumbnailUri(
    std::string albumId,
    std::string photoId,
    ReactPromiseJS &&promise) noexcept {
  RunAsync(
      [albumId = std::move(albumId), photoId = std::move(photoId)]() {
        const auto thumbPath = ThumbnailPathForAlbum(albumId, photoId);
        if (IsReusableThumbnailFile(thumbPath)) {
          return winrtRN::JSValue(FileUri(thumbPath));
        }
        return winrtRN::JSValue(nullptr);
      },
      std::move(promise));
}

void GumpLocalStorage::EnsureThumbnail(
    std::string albumId,
    std::string sourceUri,
    std::string photoId,
    ReactPromiseJS &&promise) noexcept {
  RunAsync(
      [=]() {
        const auto sourcePath = PathFromUri(sourceUri);
        if (sourcePath.empty() || !std::filesystem::exists(sourcePath)) {
          return winrtRN::JSValue(winrtRN::JSValueObject{{"thumbnailUri", nullptr}});
        }

        const auto thumbPath = GenerateThumbnailAtPath(sourcePath, albumId, photoId);
        if (!thumbPath.has_value()) {
          return winrtRN::JSValue(winrtRN::JSValueObject{{"thumbnailUri", nullptr}});
        }

        return winrtRN::JSValue(winrtRN::JSValueObject{
            {"thumbnailUri", FileUri(*thumbPath)},
        });
      },
      std::move(promise));
}

void GumpLocalStorage::EnsureFaceCrops(
    std::string albumId,
    std::string sourceUri,
    std::string photoId,
    winrtRN::JSValueArray faces,
    ReactPromiseJS &&promise) noexcept {
  RunAsync(
      [albumId = std::move(albumId),
       sourceUri = std::move(sourceUri),
       photoId = std::move(photoId),
       faces = std::move(faces)]() {
        const auto sourcePath = PathFromUri(sourceUri);
        return GenerateFaceCropsAtPath(sourcePath, albumId, photoId, faces);
      },
      std::move(promise));
}

void GumpLocalStorage::ReadImageCaptureTime(std::string uri, ReactPromiseJS &&promise) noexcept {
  RunAsync(
      [uri = std::move(uri)]() {
        const auto path = PathFromUri(uri);
        if (path.empty() || !std::filesystem::exists(path)) {
          return winrtRN::JSValue(nullptr);
        }

        const auto timestamp = ReadCaptureTimestampMillis(path);
        if (!timestamp.has_value()) {
          return winrtRN::JSValue(nullptr);
        }

        return winrtRN::JSValue(*timestamp);
      },
      std::move(promise));
}

void GumpLocalStorage::ComputePerceptualHash(std::string uri, ReactPromiseJS &&promise) noexcept {
  RunAsync(
      [uri = std::move(uri)]() {
        const auto path = PathFromUri(uri);
        if (path.empty() || !std::filesystem::exists(path)) {
          return winrtRN::JSValue(nullptr);
        }

        const auto hash = ComputeDifferenceHash(path);
        if (!hash.has_value()) {
          return winrtRN::JSValue(nullptr);
        }

        return winrtRN::JSValue(FormatHashHex(*hash));
      },
      std::move(promise));
}

} // namespace GumpDesktop
