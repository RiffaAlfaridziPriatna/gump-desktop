#include "pch.h"
#include "GumpLocalStorage.h"
#include "DifferenceHash.h"
#include "ExifDateTime.h"
#include "FaceDetectionPipeline.h"

#include <ShlObj.h>
#include <combaseapi.h>
#include <MemoryBuffer.h>
#include <cstdio>
#include <stdexcept>

#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Graphics.Imaging.h>
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
constexpr uint32_t kFaceDetectMaxPixelSize = FaceDetection::kAnalysisMaxPixelSize;
// Standalone / unified hash uses the same analysis-sized buffer as face detect.
constexpr uint32_t kPerceptualHashMaxPixelSize = FaceDetection::kAnalysisMaxPixelSize;
constexpr uint32_t kFaceCropSourceMaxPixelSize = 1600;
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

  std::filesystem::path path(ToWide(pathPart));
  path.make_preferred();
  return path;
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
  return ThumbnailDirectory(albumId) / (ToWide(photoId) + L".w2.jpg");
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
  std::filesystem::path nativePath = path.lexically_normal();
  nativePath.make_preferred();
  return StorageFile::GetFileFromPathAsync(nativePath.wstring()).get();
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

  const auto legacyThumbPath =
      ThumbnailDirectory(albumId) / (ToWide(photoId) + L".jpg");
  if (std::filesystem::exists(legacyThumbPath)) {
    std::error_code ec;
    std::filesystem::remove(legacyThumbPath, ec);
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

std::optional<std::string> ReadExifDateTimeString(const BitmapDecoder &decoder) {
  static constexpr wchar_t const *kCandidateKeys[] = {
      L"/app1/ifd/exif/{ushort=36867}", // DateTimeOriginal
      L"/app1/ifd/exif/{ushort=36868}", // DateTimeDigitized
      L"/app1/ifd/{ushort=306}",        // DateTime
  };

  try {
    auto keys = winrt::single_threaded_vector<winrt::hstring>();
    for (const auto *key : kCandidateKeys) {
      keys.Append(key);
    }
    const auto props =
        decoder.BitmapProperties().GetPropertiesAsync(keys.GetView()).get();
    for (const auto *key : kCandidateKeys) {
      const winrt::hstring lookupKey{key};
      if (!props.HasKey(lookupKey)) {
        continue;
      }
      const BitmapTypedValue typed = props.Lookup(lookupKey);
      if (typed.Type() != winrt::Windows::Foundation::PropertyType::String) {
        continue;
      }
      const auto dateStr = winrt::unbox_value<winrt::hstring>(typed.Value());
      if (!dateStr.empty()) {
        return ToUtf8(dateStr);
      }
    }
  } catch (...) {
    // Fall through — some formats expose DateTaken only.
  }
  return std::nullopt;
}

std::optional<double> ReadCaptureTimestampMillis(const std::filesystem::path &path) {
  try {
    const auto file = GetStorageFileFromPath(path);
    const auto stream = file.OpenAsync(FileAccessMode::Read).get();
    const auto decoder = BitmapDecoder::CreateAsync(stream).get();
    if (const auto exif = ReadExifDateTimeString(decoder)) {
      if (const auto millis = FaceDetection::parseExifDateTimeToUnixMillisUtc(*exif)) {
        return static_cast<double>(*millis);
      }
    }
  } catch (...) {
    // Fall through to ImageProperties.DateTaken.
  }

  try {
    const auto file = GetStorageFileFromPath(path);
    const auto properties = file.Properties().GetImagePropertiesAsync().get();
    const auto dateTaken = properties.DateTaken();
    if (dateTaken == winrt::Windows::Foundation::DateTime{}) {
      return std::nullopt;
    }
    return static_cast<double>(ToUnixMillis(dateTaken));
  } catch (...) {
    return std::nullopt;
  }
}

std::filesystem::path ModuleDirectory() {
  wchar_t buffer[MAX_PATH]{};
  const DWORD length = GetModuleFileNameW(nullptr, buffer, MAX_PATH);
  if (length == 0 || length >= MAX_PATH) {
    return {};
  }
  return std::filesystem::path(buffer).parent_path();
}

FaceDetection::FaceDetectionPipeline &SharedFacePipeline() {
  static FaceDetection::FaceDetectionPipeline pipeline;
  static std::once_flag initFlag;
  std::call_once(initFlag, []() {
    const auto moduleDir = ModuleDirectory();
    FaceDetection::PipelineConfig config;
    // Keep in lockstep with macos/GumpSharedFaceDetection.mm — shared C++ defaults
    // already match, but set explicitly so platform wrappers cannot drift.
    config.scoreThreshold = 0.50f;
    config.acceptScoreThreshold = 0.65f;
    config.nmsThreshold = 0.40f;
    config.enableTiling = true;
    config.requireLandmarkPlausibility = true;
    config.enablePostProcess = false;
    config.enableTinyAreaArtifactFilter = false;
    config.enableSharpnessArtifactFilter = false;
    config.enableNativeFpFilter = true;
    for (const auto &base : {moduleDir / L"Assets" / L"Models", moduleDir / L"Models"}) {
      const auto scrfd = base / L"face_detection_scrfd_2.5g_bnkps.onnx";
      const auto ocec = base / L"eye_state_ocec_s.onnx";
      // Landmark106 EAR is available but OFF by default (see phase23 eval).
      if (std::filesystem::exists(scrfd) && std::filesystem::exists(ocec)) {
        config.scrfdModelPath = scrfd.string();
        config.ocecModelPath = ocec.string();
        break;
      }
    }
    pipeline.initialize(config);
  });
  return pipeline;
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

SoftwareBitmap LoadSoftwareBitmapScaled(
    const std::filesystem::path &path,
    uint32_t maxPixelSize) {
  const auto file = GetStorageFileFromPath(path);
  const auto stream = file.OpenAsync(FileAccessMode::Read).get();
  const auto decoder = BitmapDecoder::CreateAsync(stream).get();

  const auto targetSize = ComputeThumbnailSize(
      decoder.PixelWidth(), decoder.PixelHeight(), maxPixelSize);
  if (targetSize.width == 0 || targetSize.height == 0) {
    throw std::runtime_error("Invalid image dimensions");
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
}

FaceCropRect MakeSquareCoverCrop(const FaceCropRect &rect) {
  if (rect.width <= 0 || rect.height <= 0) {
    return rect;
  }
  if (rect.width == rect.height) {
    return rect;
  }
  if (rect.width > rect.height) {
    const int side = rect.height;
    return FaceCropRect{
        rect.left + (rect.width - side) / 2,
        rect.top,
        side,
        side,
    };
  }
  const int side = rect.width;
  return FaceCropRect{
      rect.left,
      rect.top + (rect.height - side) / 2,
      side,
      side,
  };
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

std::optional<uint64_t> ComputeDifferenceHashFromPixels(const BitmapPixels &pixels) {
  return FaceDetection::differenceHashFromBgra(
      pixels.bytes.data(), pixels.width, pixels.height, pixels.stride);
}

std::optional<uint64_t> ComputeDifferenceHash(const std::filesystem::path &path) {
  // Hash the analysis-sized original — never the UI thumbnail — so Windows
  // matches macOS unified analyze / standalone computePerceptualHash.
  const auto bitmap = LoadSoftwareBitmapScaled(path, kPerceptualHashMaxPixelSize);
  const auto pixels = ReadBitmapPixels(bitmap);
  return ComputeDifferenceHashFromPixels(pixels);
}

std::string FormatHashHex(uint64_t hash) {
  return FaceDetection::formatHashHex(hash);
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

  const auto bitmap = LoadSoftwareBitmapScaled(sourcePath, kFaceCropSourceMaxPixelSize);
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
    const auto cropRect = MakeSquareCoverCrop(ComputePaddedFaceCropRect(
        imageWidth,
        imageHeight,
        static_cast<float>(boundingBox["left"].AsDouble()),
        static_cast<float>(boundingBox["top"].AsDouble()),
        static_cast<float>(boundingBox["width"].AsDouble()),
        static_cast<float>(boundingBox["height"].AsDouble())));

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

winrtRN::JSValueObject FaceToJsObject(const FaceDetection::FaceResult &face) {
  winrtRN::JSValueArray landmarks;
  for (const auto &lm : face.landmarks) {
    landmarks.push_back(winrtRN::JSValueObject{
        {"type", lm.type},
        {"x", static_cast<double>(lm.x)},
        {"y", static_cast<double>(lm.y)},
    });
  }

  return winrtRN::JSValueObject{
      {"boundingBox",
       winrtRN::JSValueObject{
           {"left", static_cast<double>(face.left)},
           {"top", static_cast<double>(face.top)},
           {"width", static_cast<double>(face.width)},
           {"height", static_cast<double>(face.height)},
       }},
      {"eyesOpen",
       winrtRN::JSValueObject{
           {"value", face.eyesOpen.value},
           {"confidence", static_cast<double>(face.eyesOpen.confidence)},
           {"leftProbability", static_cast<double>(face.eyesOpen.leftProbability)},
           {"rightProbability", static_cast<double>(face.eyesOpen.rightProbability)},
       }},
      {"eyeStatus", face.eyeStatus},
      {"focusLevel", face.focusLevel},
      {"sharpness", static_cast<double>(face.sharpness)},
      {"brightness", static_cast<double>(face.brightness)},
      {"confidence", static_cast<double>(face.confidence)},
      {"landmarks", std::move(landmarks)},
      {"pose",
       winrtRN::JSValueObject{
           {"pitch", static_cast<double>(face.pose.pitch)},
           {"roll", static_cast<double>(face.pose.roll)},
           {"yaw", static_cast<double>(face.pose.yaw)},
       }},
      {"faceId", face.faceId},
      {"engine", face.engine},
  };
}

winrtRN::JSValueArray DetectFacesFromPixels(const BitmapPixels &pixels) {
  auto &pipeline = SharedFacePipeline();
  auto faces = pipeline.detectFaces(
      pixels.bytes.data(), pixels.width, pixels.height, pixels.stride);

  winrtRN::JSValueArray result;
  result.reserve(faces.size());
  for (const auto &face : faces) {
    result.push_back(FaceToJsObject(face));
  }
  return result;
}

winrtRN::JSValueArray DetectFaces(const std::filesystem::path &path) {
  const auto bitmap = LoadSoftwareBitmapScaled(path, kFaceDetectMaxPixelSize);
  const auto pixels = ReadBitmapPixels(bitmap);
  return DetectFacesFromPixels(pixels);
}

winrtRN::JSValueObject AnalyzePhotoPayload(const std::filesystem::path &path) {
  const auto bitmap = LoadSoftwareBitmapScaled(path, kFaceDetectMaxPixelSize);
  const auto pixels = ReadBitmapPixels(bitmap);

  auto faces = DetectFacesFromPixels(pixels);
  winrtRN::JSValue perceptualHash = nullptr;
  if (const auto hash = ComputeDifferenceHashFromPixels(pixels)) {
    perceptualHash = FormatHashHex(*hash);
  }

  winrtRN::JSValue capturedAt = nullptr;
  if (const auto timestamp = ReadCaptureTimestampMillis(path)) {
    capturedAt = *timestamp;
  }

  return winrtRN::JSValueObject{
      {"faces", std::move(faces)},
      {"perceptualHash", std::move(perceptualHash)},
      {"capturedAt", std::move(capturedAt)},
  };
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

void GumpLocalStorage::AnalyzePhotoForCulling(std::string uri, ReactPromiseJS &&promise) noexcept {
  RunAsync(
      [uri = std::move(uri)]() {
        const auto path = PathFromUri(uri);
        if (path.empty() || !std::filesystem::exists(path)) {
          throw std::runtime_error("Photo file not found");
        }
        return winrtRN::JSValue(AnalyzePhotoPayload(path));
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

        const auto thumbPath = GenerateThumbnailAtPath(destPath, albumId, destId);
        if (!thumbPath) {
          std::error_code ec;
          std::filesystem::remove(destPath, ec);
          throw std::runtime_error("Failed to generate thumbnail for local photo copy");
        }

        winrtRN::JSValueObject result{
            {"uri", FileUri(destPath)},
            {"name", destName},
            {"size", static_cast<double>(std::filesystem::file_size(destPath))},
            {"type", MimeTypeForPath(destPath)},
            {"thumbnailUri", FileUri(*thumbPath)},
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
        const auto thumbPath = thumbsDir / (path.stem().wstring() + L".w2.jpg");
        if (std::filesystem::exists(thumbPath)) {
          std::filesystem::remove(thumbPath);
        }
        const auto legacyThumbPath = thumbsDir / (path.stem().wstring() + L".jpg");
        if (std::filesystem::exists(legacyThumbPath)) {
          std::filesystem::remove(legacyThumbPath);
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
