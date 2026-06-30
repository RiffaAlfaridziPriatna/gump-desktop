#include "pch.h"

#include "GumpLocalStorage.h"

#include <ShlObj.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Graphics.Imaging.h>
#include <winrt/Windows.Media.FaceAnalysis.h>
#include <winrt/Windows.Security.Cryptography.h>
#include <winrt/Windows.Storage.h>
#include <winrt/Windows.Storage.FileProperties.h>
#include <winrt/Windows.Storage.Streams.h>
#include <winrt/Windows.Web.Http.h>

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <optional>
#include <thread>

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
  if (uri.rfind("file://", 0) == 0) {
    const auto wide = ToWide(uri.substr(7));
    return std::filesystem::path(wide);
  }
  return std::filesystem::path(ToWide(uri));
}

std::filesystem::path CullingAlbumDirectory(std::string_view albumId) {
  PWSTR localAppData = nullptr;
  SHGetKnownFolderPath(FOLDERID_LocalAppData, 0, nullptr, &localAppData);
  std::filesystem::path base(localAppData);
  CoTaskMemFree(localAppData);
  return base / "Gump" / "culling-albums" / std::filesystem::path(ToWide(albumId));
}

std::string FileUri(const std::filesystem::path &path) {
  const auto wide = path.wstring();
  return "file:///" + ToUtf8(wide);
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
  const auto file =
      StorageFile::GetFileFromPathAsync(winrt::to_hstring(path.wstring())).get();
  const auto properties = file.Properties().GetImagePropertiesAsync().get();
  const auto dateTaken = properties.DateTaken();
  if (dateTaken == winrt::Windows::Foundation::DateTime{}) {
    return std::nullopt;
  }
  return static_cast<double>(ToUnixMillis(dateTaken));
}

winrtRN::JSValueObject EyesOpenFromScore(float openness) {
  const float openThreshold = 0.75f;
  const float closedThreshold = 0.35f;

  winrtRN::JSValueObject eyesOpen;
  if (openness >= openThreshold) {
    eyesOpen["value"] = true;
    eyesOpen["confidence"] = std::min(98.0, 86.0 + (openness - openThreshold) * 200.0);
  } else if (openness <= closedThreshold) {
    eyesOpen["value"] = false;
    eyesOpen["confidence"] = std::min(98.0, 86.0 + (closedThreshold - openness) * 400.0);
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

  double verticalEdges = 0.0;
  double horizontalEdges = 0.0;
  int count = 0;

  for (int y = safeTop + 1; y < safeBottom - 1; ++y) {
    for (int x = safeLeft + 1; x < safeRight - 1; ++x) {
      const int index = y * stride + x * 4;
      const auto gray = [&](int px, int py) {
        const int pixelIndex = py * stride + px * 4;
        return pixels[pixelIndex] * 0.299 + pixels[pixelIndex + 1] * 0.587 + pixels[pixelIndex + 2] * 0.114;
      };

      const double gx = gray(x + 1, y) - gray(x - 1, y);
      const double gy = gray(x, y + 1) - gray(x, y - 1);
      verticalEdges += std::abs(gy);
      horizontalEdges += std::abs(gx);
      ++count;
    }
  }

  if (count == 0 || horizontalEdges < 1e-6) {
    return 0.5f;
  }

  const double ratio = verticalEdges / horizontalEdges;
  return static_cast<float>(std::max(0.0, std::min(1.0, (ratio - 0.35) / 0.9)));
}

float ComputeSharpness(const uint8_t *pixels, int width, int height, int stride, const BitmapBounds &box) {
  const int left = std::max(0, static_cast<int>(box.X));
  const int top = std::max(0, static_cast<int>(box.Y));
  const int right = std::min(width, left + static_cast<int>(box.Width));
  const int bottom = std::min(height, top + static_cast<int>(box.Height));
  if (right - left < 3 || bottom - top < 3) {
    return 50.0f;
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
    return 50.0f;
  }

  const double mean = sum / count;
  const double variance = (sumSquared / count) - mean * mean;
  const float normalized = static_cast<float>(std::log(variance + 1.0) / std::log(1000.0) * 100.0);
  return std::max(0.0f, std::min(100.0f, normalized));
}

SoftwareBitmap LoadSoftwareBitmap(const std::filesystem::path &path) {
  const auto file = StorageFile::GetFileFromPathAsync(path.wstring()).get();
  const auto stream = file.OpenAsync(FileAccessMode::Read).get();
  const auto decoder = BitmapDecoder::CreateAsync(stream).get();
  auto bitmap = decoder.GetSoftwareBitmapAsync().get();
  return SoftwareBitmap::Convert(bitmap, BitmapPixelFormat::Bgra8, BitmapAlphaMode::Premultiplied);
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
  const auto plane = buffer.GetPlaneDescription(0);
  const auto access = reference.as<::Windows::Foundation::IMemoryBufferByteAccess>();

  byte *data = nullptr;
  uint32_t capacity = 0;
  winrt::check_hresult(access->GetBuffer(&data, &capacity));

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

winrtRN::JSValueArray DetectFaces(const std::filesystem::path &path) {
  const auto detector = FaceDetector::CreateAsync().get();
  const auto bitmap = LoadSoftwareBitmap(path);
  const auto faces = detector.DetectFacesAsync(bitmap).get();
  const auto pixels = ReadBitmapPixels(bitmap);

  const int imageWidth = pixels.width;
  const int imageHeight = pixels.height;
  const int stride = pixels.stride;
  const uint8_t *pixelData = pixels.bytes.data();

  winrtRN::JSValueArray result;
  int index = 0;
  for (const auto &face : faces) {
    const auto box = face.FaceBox();
    const float left = static_cast<float>(box.X) / imageWidth;
    const float top = static_cast<float>(box.Y) / imageHeight;
    const float width = static_cast<float>(box.Width) / imageWidth;
    const float height = static_cast<float>(box.Height) / imageHeight;

    const int eyeTop = static_cast<int>(box.Y + box.Height * 0.18f);
    const int eyeHeight = static_cast<int>(box.Height * 0.22f);
    const int leftEyeLeft = static_cast<int>(box.X + box.Width * 0.12f);
    const int leftEyeWidth = static_cast<int>(box.Width * 0.28f);
    const int rightEyeLeft = static_cast<int>(box.X + box.Width * 0.60f);
    const int rightEyeWidth = static_cast<int>(box.Width * 0.28f);

    const float leftOpen = EstimateEyeOpenness(
        pixelData, imageWidth, imageHeight, stride, leftEyeLeft, eyeTop, leftEyeWidth, eyeHeight);
    const float rightOpen = EstimateEyeOpenness(
        pixelData, imageWidth, imageHeight, stride, rightEyeLeft, eyeTop, rightEyeWidth, eyeHeight);
    const float minOpen = std::min(leftOpen, rightOpen);
    const float sharpness = ComputeSharpness(pixelData, imageWidth, imageHeight, stride, box);

    winrtRN::JSValueObject faceObject{
        {"boundingBox",
         winrtRN::JSValueObject{
             {"left", left},
             {"top", top},
             {"width", width},
             {"height", height},
         }},
        {"eyesOpen", EyesOpenFromScore(minOpen)},
        {"sharpness", sharpness},
        {"brightness", 60.0},
        {"landmarks",
         winrtRN::JSValueArray{
             winrtRN::JSValueObject{
                 {"type", "eyeLeft"},
                 {"x", left + width * 0.25},
                 {"y", 1.0 - (top + height * 0.32)},
             },
             winrtRN::JSValueObject{
                 {"type", "eyeRight"},
                 {"x", left + width * 0.75},
                 {"y", 1.0 - (top + height * 0.32)},
             },
             winrtRN::JSValueObject{
                 {"type", "nose"},
                 {"x", left + width * 0.5},
                 {"y", 1.0 - (top + height * 0.55)},
             },
             winrtRN::JSValueObject{
                 {"type", "mouth"},
                 {"x", left + width * 0.5},
                 {"y", 1.0 - (top + height * 0.78)},
             },
         }},
        {"pose", winrtRN::JSValueObject{{"pitch", 0.0}, {"roll", 0.0}, {"yaw", 0.0}}},
        {"faceId", "local-face-" + std::to_string(index)},
    };

    result.push_back(std::move(faceObject));
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
      promise.Reject(ToUtf8(error.message()));
    } catch (const std::exception &error) {
      promise.Reject(error.what());
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
      promise.Reject(ToUtf8(error.message()));
    } catch (const std::exception &error) {
      promise.Reject(error.what());
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
        return winrtRN::JSValue(DetectFaces(path));
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
        const auto destId =
            photoId.empty() ? ToUtf8(winrt::to_hstring(winrt::Windows::Foundation::Guid::NewGuid())) : photoId;
        const auto destName = extension.empty() ? destId : destId + ToUtf8(extension.wstring());
        const auto destPath = albumDir / ToWide(destName);
        std::filesystem::copy_file(sourcePath, destPath, std::filesystem::copy_options::overwrite_existing);

        return winrtRN::JSValue(winrtRN::JSValueObject{
            {"uri", FileUri(destPath)},
            {"name", destName},
            {"size", static_cast<double>(std::filesystem::file_size(destPath))},
            {"type", MimeTypeForPath(destPath)},
        });
      },
      std::move(promise));
}

void GumpLocalStorage::ListPhotos(std::string albumId, ReactPromiseJS &&promise) noexcept {
  RunAsync(
      [albumId = std::move(albumId)]() {
        const auto albumDir = CullingAlbumDirectory(albumId);
        winrtRN::JSValueArray files;
        if (!std::filesystem::exists(albumDir)) {
          return winrtRN::JSValue(files);
        }

        for (const auto &entry : std::filesystem::directory_iterator(albumDir)) {
          if (!entry.is_regular_file()) {
            continue;
          }
          const auto name = ToUtf8(entry.path().filename().wstring());
          if (!name.empty() && name[0] == '.') {
            continue;
          }
          files.push_back(winrtRN::JSValueObject{
              {"uri", FileUri(entry.path())},
              {"name", name},
              {"size", static_cast<double>(entry.file_size())},
              {"type", MimeTypeForPath(entry.path())},
          });
        }

        return winrtRN::JSValue(files);
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
        HttpRequestMessage request(HttpMethod::Put(), Uri(ToWide(uploadUrl)));
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

        const auto bitmap = LoadSoftwareBitmap(path);
        return winrtRN::JSValue(winrtRN::JSValueObject{
            {"width", static_cast<double>(bitmap.PixelWidth())},
            {"height", static_cast<double>(bitmap.PixelHeight())},
        });
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
