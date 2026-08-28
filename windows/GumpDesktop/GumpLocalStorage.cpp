#include "pch.h"
#include "GumpLocalStorage.h"
#include "DifferenceHash.h"
#include "ExifDateTime.h"
#include "FaceDetectionPipeline.h"
#include "MediaDerivatives.h"

// Analysis session includes
#include "../../cpp/analysis/AnalysisSession.h"
#include "../../cpp/analysis/PhotoFlags.h"
#include "../../cpp/analysis/FaceCluster.h"
#include "../../cpp/analysis/DuplicateDetection.h"

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
#include <memory>
#include <mutex>
#include <optional>
#include <string>
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

// New Windows thumbs are 1280. Existing 1920 .v4.jpg files stay reusable so
// opening a current album does not regenerate thousands of JPEGs.
constexpr uint32_t kThumbnailGenerateMaxPixelSize = 1280;
constexpr uint32_t kThumbnailReusableMaxPixelSize =
    MediaDerivatives::kThumbnailMaxPixelSize;
constexpr float kThumbnailJpegQuality = MediaDerivatives::kThumbnailJpegQuality;
constexpr uint32_t kDetailMaxPixelSize = MediaDerivatives::kDetailMaxPixelSize;
constexpr float kDetailJpegQuality = MediaDerivatives::kDetailJpegQuality;
constexpr int kThumbnailMaxConcurrent = 4;
constexpr uint32_t kFaceDetectMaxPixelSize = FaceDetection::kAnalysisMaxPixelSize;
// Standalone / unified hash uses the same analysis-sized buffer as face detect.
constexpr uint32_t kPerceptualHashMaxPixelSize = FaceDetection::kAnalysisMaxPixelSize;
constexpr uint32_t kFaceCropSourceMaxPixelSize = FaceDetection::kAnalysisMaxPixelSize;
constexpr uint32_t kFaceCropOutputPixelSize = MediaDerivatives::kFaceCropOutputPixelSize;
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
  return ThumbnailDirectory(albumId) / (ToWide(photoId) + L".v4.jpg");
}

std::filesystem::path DetailDirectory(std::string_view albumId) {
  return CullingAlbumDirectory(albumId) / L"details";
}

std::filesystem::path DetailPathForAlbum(std::string_view albumId, std::string_view photoId) {
  return DetailDirectory(albumId) / (ToWide(photoId) + L".d1.jpg");
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

bool IsReusableOrientedJpegFile(
    const std::filesystem::path &jpegPath,
    uint32_t maxPixelSize) {
  if (jpegPath.empty() || !std::filesystem::exists(jpegPath)) {
    return false;
  }

  try {
    const auto file = GetStorageFileFromPath(jpegPath);
    const auto stream = file.OpenAsync(FileAccessMode::Read).get();
    const auto decoder = BitmapDecoder::CreateAsync(stream).get();
    return decoder.OrientedPixelWidth() > 0 &&
           decoder.OrientedPixelHeight() > 0 &&
           decoder.OrientedPixelWidth() <= maxPixelSize &&
           decoder.OrientedPixelHeight() <= maxPixelSize;
  } catch (...) {
    return false;
  }
}

struct PixelSize {
  uint32_t width{0};
  uint32_t height{0};
};

PixelSize ReadOrientedJpegSize(const std::filesystem::path &jpegPath) {
  try {
    const auto file = GetStorageFileFromPath(jpegPath);
    const auto stream = file.OpenAsync(FileAccessMode::Read).get();
    const auto decoder = BitmapDecoder::CreateAsync(stream).get();
    return {
        decoder.OrientedPixelWidth(),
        decoder.OrientedPixelHeight(),
    };
  } catch (...) {
    return {};
  }
}

bool IsReusableThumbnailFile(const std::filesystem::path &thumbPath) {
  return IsReusableOrientedJpegFile(thumbPath, kThumbnailReusableMaxPixelSize);
}

struct ThumbnailResult {
  std::optional<std::filesystem::path> path;
  uint32_t width{0};
  uint32_t height{0};
};

bool IsReusableDetailFile(const std::filesystem::path &detailPath) {
  return IsReusableOrientedJpegFile(detailPath, kDetailMaxPixelSize);
}

SoftwareBitmap DecodeOrientedScaledBitmap(
    const std::filesystem::path &decodePath,
    uint32_t maxPixelSize) {
  const auto sourceFile = GetStorageFileFromPath(decodePath);
  const auto sourceStream = sourceFile.OpenAsync(FileAccessMode::Read).get();
  const auto decoder = BitmapDecoder::CreateAsync(sourceStream).get();

  // BitmapTransform scale runs in SOURCE pixel space, before EXIF flip/rotate.
  // Use PixelWidth/Height here; RespectExifOrientation then orients the result.
  const auto sourceWidth = decoder.PixelWidth();
  const auto sourceHeight = decoder.PixelHeight();
  const auto targetSize =
      ComputeThumbnailSize(sourceWidth, sourceHeight, maxPixelSize);
  if (targetSize.width == 0 || targetSize.height == 0) {
    return nullptr;
  }

  BitmapTransform transform;
  if (targetSize.width != sourceWidth || targetSize.height != sourceHeight) {
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

SoftwareBitmap DecodeOrientedScaledBitmapWithFallback(
    const std::filesystem::path &sourcePath,
    uint32_t maxPixelSize) {
  try {
    return DecodeOrientedScaledBitmap(sourcePath, maxPixelSize);
  } catch (...) {
    const auto tempSource =
        std::filesystem::temp_directory_path() /
        (L"gump-orient-src-" + std::to_wstring(GetTickCount64()) +
         sourcePath.extension().wstring());
    if (!CopyFileW(sourcePath.c_str(), tempSource.c_str(), FALSE)) {
      return nullptr;
    }
    try {
      auto bitmap = DecodeOrientedScaledBitmap(tempSource, maxPixelSize);
      DeleteFileW(tempSource.c_str());
      return bitmap;
    } catch (...) {
      DeleteFileW(tempSource.c_str());
      return nullptr;
    }
  }
}

std::optional<std::filesystem::path> WriteOrientedJpegDerivative(
    const SoftwareBitmap &bitmap,
    const std::filesystem::path &desiredPath,
    float jpegQuality,
    uint32_t maxPixelSize) {
  if (!bitmap) {
    return std::nullopt;
  }

  const auto targetSize = ComputeThumbnailSize(
      bitmap.PixelWidth(), bitmap.PixelHeight(), maxPixelSize);
  if (targetSize.width == 0 || targetSize.height == 0) {
    return std::nullopt;
  }

  std::filesystem::create_directories(desiredPath.parent_path());
  const auto outPath = ChooseWritablePath(desiredPath);

  const bool needsScale = targetSize.width != bitmap.PixelWidth() ||
                          targetSize.height != bitmap.PixelHeight();
  const bool wrote = needsScale
                         ? WriteSoftwareBitmapJpeg(
                               bitmap,
                               outPath,
                               jpegQuality,
                               targetSize.width,
                               targetSize.height)
                         : WriteSoftwareBitmapJpeg(bitmap, outPath, jpegQuality);
  if (!wrote) {
    return std::nullopt;
  }
  return outPath;
}

ThumbnailResult GenerateThumbnailAtPath(
    const std::filesystem::path &sourcePath,
    std::string_view albumId,
    std::string_view photoId) {
  ThumbnailConcurrencyGuard concurrencyGuard;
  ThumbnailResult result;

  if (sourcePath.empty() || !std::filesystem::exists(sourcePath)) {
    return result;
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

  const auto legacyW2ThumbPath =
      ThumbnailDirectory(albumId) / (ToWide(photoId) + L".w2.jpg");
  if (std::filesystem::exists(legacyW2ThumbPath)) {
    std::error_code ec;
    std::filesystem::remove(legacyW2ThumbPath, ec);
  }

  const auto legacyW3ThumbPath =
      ThumbnailDirectory(albumId) / (ToWide(photoId) + L".w3.jpg");
  if (std::filesystem::exists(legacyW3ThumbPath)) {
    std::error_code ec;
    std::filesystem::remove(legacyW3ThumbPath, ec);
  }

  if (IsReusableThumbnailFile(desiredThumbPath)) {
    const auto size = ReadOrientedJpegSize(desiredThumbPath);
    result.path = desiredThumbPath;
    result.width = size.width;
    result.height = size.height;
    return result;
  }

  const auto bitmap = DecodeOrientedScaledBitmapWithFallback(
      sourcePath, kThumbnailGenerateMaxPixelSize);
  const auto written = WriteOrientedJpegDerivative(
      bitmap,
      desiredThumbPath,
      kThumbnailJpegQuality,
      kThumbnailGenerateMaxPixelSize);
  if (!written) {
    return result;
  }

  result.path = written;
  if (bitmap) {
    const auto targetSize = ComputeThumbnailSize(
        bitmap.PixelWidth(),
        bitmap.PixelHeight(),
        kThumbnailGenerateMaxPixelSize);
    result.width = targetSize.width;
    result.height = targetSize.height;
  }
  return result;
}

std::optional<std::filesystem::path> GenerateDetailAtPath(
    const std::filesystem::path &sourcePath,
    std::string_view albumId,
    std::string_view photoId) {
  ThumbnailConcurrencyGuard concurrencyGuard;

  if (sourcePath.empty() || !std::filesystem::exists(sourcePath)) {
    return std::nullopt;
  }

  const auto desiredDetailPath = DetailPathForAlbum(albumId, photoId);
  if (IsReusableDetailFile(desiredDetailPath)) {
    return desiredDetailPath;
  }

  std::filesystem::create_directories(desiredDetailPath.parent_path());
  const auto bitmap =
      DecodeOrientedScaledBitmapWithFallback(sourcePath, kDetailMaxPixelSize);
  return WriteOrientedJpegDerivative(
      bitmap, desiredDetailPath, kDetailJpegQuality, kDetailMaxPixelSize);
}

struct OrientedDerivatives {
  std::optional<std::filesystem::path> thumbnailPath;
  uint32_t thumbnailWidth{0};
  uint32_t thumbnailHeight{0};
};

OrientedDerivatives GenerateOrientedDerivativesAtPath(
    const std::filesystem::path &sourcePath,
    std::string_view albumId,
    std::string_view photoId) {
  ThumbnailConcurrencyGuard concurrencyGuard;
  OrientedDerivatives result;

  if (sourcePath.empty() || !std::filesystem::exists(sourcePath)) {
    return result;
  }

  const auto desiredThumbPath = ThumbnailPathForAlbum(albumId, photoId);
  std::filesystem::create_directories(desiredThumbPath.parent_path());

  // Clean up legacy thumb files
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
  const auto legacyW2ThumbPath =
      ThumbnailDirectory(albumId) / (ToWide(photoId) + L".w2.jpg");
  if (std::filesystem::exists(legacyW2ThumbPath)) {
    std::error_code ec;
    std::filesystem::remove(legacyW2ThumbPath, ec);
  }
  const auto legacyW3ThumbPath =
      ThumbnailDirectory(albumId) / (ToWide(photoId) + L".w3.jpg");
  if (std::filesystem::exists(legacyW3ThumbPath)) {
    std::error_code ec;
    std::filesystem::remove(legacyW3ThumbPath, ec);
  }

  const bool reusableThumb = IsReusableThumbnailFile(desiredThumbPath);
  if (reusableThumb) {
    const auto size = ReadOrientedJpegSize(desiredThumbPath);
    result.thumbnailPath = desiredThumbPath;
    result.thumbnailWidth = size.width;
    result.thumbnailHeight = size.height;
    return result;
  }

  const auto thumbBitmap = DecodeOrientedScaledBitmapWithFallback(
      sourcePath, kThumbnailGenerateMaxPixelSize);
  if (!thumbBitmap) {
    return result;
  }

  result.thumbnailPath = WriteOrientedJpegDerivative(
      thumbBitmap,
      desiredThumbPath,
      kThumbnailJpegQuality,
      kThumbnailGenerateMaxPixelSize);
  if (result.thumbnailPath) {
    const auto targetSize = ComputeThumbnailSize(
        thumbBitmap.PixelWidth(),
        thumbBitmap.PixelHeight(),
        kThumbnailGenerateMaxPixelSize);
    result.thumbnailWidth = targetSize.width;
    result.thumbnailHeight = targetSize.height;
  }

  return result;
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

winrtRN::JSValueObject ThumbnailJsObject(const ThumbnailResult &thumb) {
  if (!thumb.path) {
    return winrtRN::JSValueObject{{"thumbnailUri", nullptr}};
  }

  winrtRN::JSValueObject result{{"thumbnailUri", FileUri(*thumb.path)}};
  if (thumb.width > 0 && thumb.height > 0) {
    result["thumbnailWidth"] = static_cast<double>(thumb.width);
    result["thumbnailHeight"] = static_cast<double>(thumb.height);
  }
  return result;
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
    config.pipelinePoolSize = 2;
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
    if (pipeline.isReady()) {
      OutputDebugStringA(
          ("[GumpLocalStorage] SCRFD+OCEC ready workers=" +
           std::to_string(pipeline.workerCount()) + "\n")
              .c_str());
    }
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
    const auto cropRect =
        MediaDerivatives::MakeSquareCoverCrop(MediaDerivatives::ComputePaddedFaceCropRect(
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

        const auto derivatives =
            GenerateOrientedDerivativesAtPath(destPath, albumId, destId);
        if (!derivatives.thumbnailPath) {
          std::error_code ec;
          std::filesystem::remove(destPath, ec);
          throw std::runtime_error("Failed to generate thumbnail for local photo copy");
        }

        winrtRN::JSValueObject result{
            {"uri", FileUri(destPath)},
            {"name", destName},
            {"size", static_cast<double>(std::filesystem::file_size(destPath))},
            {"type", MimeTypeForPath(destPath)},
            {"thumbnailUri", FileUri(*derivatives.thumbnailPath)},
        };
        if (derivatives.thumbnailWidth > 0 && derivatives.thumbnailHeight > 0) {
          result["thumbnailWidth"] =
              static_cast<double>(derivatives.thumbnailWidth);
          result["thumbnailHeight"] =
              static_cast<double>(derivatives.thumbnailHeight);
        }

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
          if (name == "thumbs" || name == "details" || name == "previews" ||
              name == "face-thumbs") {
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
        const auto thumbPath = thumbsDir / (path.stem().wstring() + L".v4.jpg");
        if (std::filesystem::exists(thumbPath)) {
          std::filesystem::remove(thumbPath);
        }
        const auto legacyW3ThumbPath =
            thumbsDir / (path.stem().wstring() + L".w3.jpg");
        if (std::filesystem::exists(legacyW3ThumbPath)) {
          std::filesystem::remove(legacyW3ThumbPath);
        }
        const auto legacyW2ThumbPath =
            thumbsDir / (path.stem().wstring() + L".w2.jpg");
        if (std::filesystem::exists(legacyW2ThumbPath)) {
          std::filesystem::remove(legacyW2ThumbPath);
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

        const auto detailPath =
            albumDir / L"details" / (path.stem().wstring() + L".d1.jpg");
        if (std::filesystem::exists(detailPath)) {
          std::filesystem::remove(detailPath);
        }

        const auto previewPath =
            albumDir / L"previews" / (path.stem().wstring() + L".w3.jpg");
        if (std::filesystem::exists(previewPath)) {
          std::filesystem::remove(previewPath);
        }
        const auto legacyW2PreviewPath =
            albumDir / L"previews" / (path.stem().wstring() + L".w2.jpg");
        if (std::filesystem::exists(legacyW2PreviewPath)) {
          std::filesystem::remove(legacyW2PreviewPath);
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

        const auto thumb = GenerateThumbnailAtPath(sourcePath, albumId, photoId);
        return winrtRN::JSValue(ThumbnailJsObject(thumb));
      },
      std::move(promise));
}

void GumpLocalStorage::EnsureDetail(
    std::string albumId,
    std::string sourceUri,
    std::string photoId,
    ReactPromiseJS &&promise) noexcept {
  RunAsync(
      [=]() {
        const auto sourcePath = PathFromUri(sourceUri);
        if (sourcePath.empty() || !std::filesystem::exists(sourcePath)) {
          return winrtRN::JSValue(winrtRN::JSValueObject{{"detailUri", nullptr}});
        }

        const auto detailPath = GenerateDetailAtPath(sourcePath, albumId, photoId);
        if (!detailPath.has_value()) {
          return winrtRN::JSValue(winrtRN::JSValueObject{{"detailUri", nullptr}});
        }

        return winrtRN::JSValue(winrtRN::JSValueObject{
            {"detailUri", FileUri(*detailPath)},
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

// ============================================================================
// Windows Platform Decoder for Analysis Session
// ============================================================================

class WindowsPlatformDecoder : public Analysis::PlatformDecoder {
public:
  explicit WindowsPlatformDecoder(winrtRN::ReactContext reactContext)
      : m_reactContext(std::move(reactContext)) {}

  Analysis::DecodedImage DecodeImageToBgra(const std::string &uri, int maxPixelSize) override {
    Analysis::DecodedImage result;
    try {
      const auto path = PathFromUri(uri);
      const auto bitmap = LoadSoftwareBitmapScaled(path, static_cast<uint32_t>(maxPixelSize));
      auto pixels = std::make_shared<BitmapPixels>(ReadBitmapPixels(bitmap));
      result.width = pixels->width;
      result.height = pixels->height;
      result.stride = pixels->stride;
      result.bgraPixels = pixels->bytes.data();
      result.platformHandle = std::move(pixels);
      result.success = true;
    } catch (const std::exception &e) {
      result.error = e.what();
    }
    return result;
  }

  int64_t ReadCapturedAtMillis(const std::string &uri) override {
    try {
      const auto path = PathFromUri(uri);
      const auto timestamp = ReadCaptureTimestampMillis(path);
      return timestamp.value_or(0);
    } catch (...) {
      return 0;
    }
  }

  std::string GetDatabasePath() const override {
    PWSTR localAppData = nullptr;
    SHGetKnownFolderPath(FOLDERID_LocalAppData, 0, nullptr, &localAppData);
    std::filesystem::path path(localAppData);
    CoTaskMemFree(localAppData);
    path /= L"Gump";
    std::filesystem::create_directories(path);
    return (path / L"gump.db").string();
  }

private:
  winrtRN::ReactContext m_reactContext;
};

// ============================================================================
// Analysis Session Management
// ============================================================================

namespace {
std::unique_ptr<WindowsPlatformDecoder> g_decoder;
std::unique_ptr<Analysis::AnalysisSession> g_analysisSession;
std::mutex g_sessionMutex;
winrtRN::ReactContext g_sessionReactContext{nullptr};

void EmitAnalysisProgress(const Analysis::ProgressUpdate &progress) {
  if (!g_sessionReactContext) {
    return;
  }

  winrtRN::JSValueObject event;
  event["done"] = progress.done;
  event["failed"] = progress.failed;
  event["total"] = progress.total;

  g_sessionReactContext.EmitJSEvent(
      L"RCTDeviceEventEmitter",
      L"analysisProgress",
      event);
}

void EmitAnalysisComplete(const Analysis::CompletionSummary &summary) {
  if (!g_sessionReactContext) {
    return;
  }

  winrtRN::JSValueArray resultsArray;
  for (const auto &result : summary.results) {
    winrtRN::JSValueArray facesArray;
    for (const auto &face : result.faces) {
      facesArray.push_back(FaceToJsObject(face));
    }

    winrtRN::JSValueObject photoObj;
    photoObj["photoId"] = result.photoId;
    photoObj["success"] = result.success;
    photoObj["error"] = result.error;
    photoObj["faces"] = std::move(facesArray);
    if (result.perceptualHash.empty()) {
      photoObj["perceptualHash"] = nullptr;
    } else {
      photoObj["perceptualHash"] = result.perceptualHash;
    }
    if (result.capturedAt == 0) {
      photoObj["capturedAt"] = nullptr;
    } else {
      photoObj["capturedAt"] = static_cast<double>(result.capturedAt);
    }
    resultsArray.push_back(std::move(photoObj));
  }

  winrtRN::JSValueObject event;
  event["done"] = summary.done;
  event["total"] = summary.total;
  event["failed"] = summary.failed;
  event["results"] = std::move(resultsArray);

  g_sessionReactContext.EmitJSEvent(
      L"RCTDeviceEventEmitter",
      L"analysisComplete",
      event);
}

} // anonymous namespace

// ============================================================================
// React Native Bridge Methods
// ============================================================================

void GumpLocalStorage::Initialize(winrt::Microsoft::ReactNative::ReactContext const &reactContext) noexcept {
  m_reactContext = reactContext;
  std::lock_guard<std::mutex> lock(g_sessionMutex);
  g_sessionReactContext = reactContext;
}

void GumpLocalStorage::StartAnalysis(
    std::string albumId,
    winrtRN::JSValueArray photos,
    winrtRN::JSValue config,
    ReactPromiseJS &&promise) noexcept {
  try {
    std::lock_guard<std::mutex> lock(g_sessionMutex);

    // Check if session already running
    if (g_analysisSession && g_analysisSession->IsRunning()) {
      promise.Reject("ALREADY_RUNNING", "Analysis session is already running");
      return;
    }

    g_decoder = std::make_unique<WindowsPlatformDecoder>(m_reactContext);
    g_analysisSession = std::make_unique<Analysis::AnalysisSession>();

    Analysis::SessionConfig sessionConfig;
    sessionConfig.albumId = albumId;
    sessionConfig.decoder = g_decoder.get();
    sessionConfig.maxConcurrency = 2;
    sessionConfig.pipelinePoolSize = 2;
    sessionConfig.progressIntervalMs = 500;

    if (config.Type() == winrtRN::JSValueType::Object) {
      auto configObj = config.AsObject();
      if (configObj.count("maxConcurrency") &&
          configObj["maxConcurrency"].Type() == winrtRN::JSValueType::Int64) {
        sessionConfig.maxConcurrency =
            static_cast<int>(configObj["maxConcurrency"].AsInt64());
      }
    }

    FaceDetection::PipelineConfig pipelineConfig;
    pipelineConfig.scoreThreshold = 0.50f;
    pipelineConfig.acceptScoreThreshold = 0.65f;
    pipelineConfig.nmsThreshold = 0.40f;
    pipelineConfig.enableTiling = true;
    pipelineConfig.requireLandmarkPlausibility = true;
    pipelineConfig.enableNativeFpFilter = true;
    pipelineConfig.pipelinePoolSize = 2;
    const auto moduleDir = ModuleDirectory();
    for (const auto &base : {moduleDir / L"Assets" / L"Models", moduleDir / L"Models"}) {
      const auto scrfd = base / L"face_detection_scrfd_2.5g_bnkps.onnx";
      const auto ocec = base / L"eye_state_ocec_s.onnx";
      if (std::filesystem::exists(scrfd) && std::filesystem::exists(ocec)) {
        pipelineConfig.scrfdModelPath = scrfd.string();
        pipelineConfig.ocecModelPath = ocec.string();
        break;
      }
    }
    sessionConfig.pipelineConfig = pipelineConfig;

    for (size_t i = 0; i < photos.size(); ++i) {
      const auto &photo = photos[i];
      if (photo.Type() != winrtRN::JSValueType::Object) {
        continue;
      }

      const auto photoObj = photo.AsObject();
      Analysis::PhotoInput input;

      if (photoObj.count("photoId") && photoObj["photoId"].Type() == winrtRN::JSValueType::String) {
        input.photoId = photoObj["photoId"].AsString();
      }
      if (photoObj.count("uri") && photoObj["uri"].Type() == winrtRN::JSValueType::String) {
        input.uri = photoObj["uri"].AsString();
      }
      if (photoObj.count("fileName") && photoObj["fileName"].Type() == winrtRN::JSValueType::String) {
        input.fileName = photoObj["fileName"].AsString();
      }
      if (photoObj.count("capturedAt") &&
          (photoObj["capturedAt"].Type() == winrtRN::JSValueType::Int64 ||
           photoObj["capturedAt"].Type() == winrtRN::JSValueType::Double)) {
        input.existingCapturedAt = static_cast<int64_t>(photoObj["capturedAt"].AsDouble());
      }
      if (photoObj.count("perceptualHash") &&
          photoObj["perceptualHash"].Type() == winrtRN::JSValueType::String) {
        input.existingHash = photoObj["perceptualHash"].AsString();
      }

      if (!input.photoId.empty() && !input.uri.empty()) {
        sessionConfig.photos.push_back(input);
      }
    }

    sessionConfig.onProgress = EmitAnalysisProgress;
    sessionConfig.onComplete = EmitAnalysisComplete;

    const bool started = g_analysisSession->Start(sessionConfig);
    if (!started) {
      g_analysisSession.reset();
      g_decoder.reset();
      promise.Reject("START_FAILED", "Failed to start analysis session");
      return;
    }

    auto result = winrtRN::JSValueObject();
    result["success"] = true;
    promise.Resolve(result);

  } catch (const std::exception &e) {
    promise.Reject("ERROR", e.what());
  } catch (...) {
    promise.Reject("ERROR", "Unknown error starting analysis");
  }
}

void GumpLocalStorage::CancelAnalysis(ReactPromiseJS &&promise) noexcept {
  try {
    std::lock_guard<std::mutex> lock(g_sessionMutex);

    if (!g_analysisSession) {
      promise.Reject("NO_SESSION", "No analysis session exists");
      return;
    }

    g_analysisSession->Cancel();

    auto result = winrtRN::JSValueObject();
    result["cancelled"] = true;
    promise.Resolve(result);

  } catch (const std::exception &e) {
    promise.Reject("ERROR", e.what());
  }
}

void GumpLocalStorage::PauseAnalysis(ReactPromiseJS &&promise) noexcept {
  try {
    std::lock_guard<std::mutex> lock(g_sessionMutex);

    if (!g_analysisSession) {
      promise.Reject("NO_SESSION", "No analysis session exists");
      return;
    }

    g_analysisSession->Pause();

    auto result = winrtRN::JSValueObject();
    result["paused"] = true;
    promise.Resolve(result);

  } catch (const std::exception &e) {
    promise.Reject("ERROR", e.what());
  }
}

void GumpLocalStorage::ResumeAnalysis(ReactPromiseJS &&promise) noexcept {
  try {
    std::lock_guard<std::mutex> lock(g_sessionMutex);

    if (!g_analysisSession) {
      promise.Reject("NO_SESSION", "No analysis session exists");
      return;
    }

    g_analysisSession->Resume();

    auto result = winrtRN::JSValueObject();
    result["resumed"] = true;
    promise.Resolve(result);

  } catch (const std::exception &e) {
    promise.Reject("ERROR", e.what());
  }
}

void GumpLocalStorage::IsAnalysisRunning(ReactPromiseJS &&promise) noexcept {
  try {
    std::lock_guard<std::mutex> lock(g_sessionMutex);

    const bool running = g_analysisSession && g_analysisSession->IsRunning();

    auto result = winrtRN::JSValueObject();
    result["running"] = running;
    promise.Resolve(result);

  } catch (const std::exception &e) {
    promise.Reject("ERROR", e.what());
  }
}

} // namespace GumpDesktop
