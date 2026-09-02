#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace Analysis {

struct DecodedImage {
  uint8_t *bgraPixels{nullptr};
  int width{0};
  int height{0};
  int stride{0};
  bool success{false};
  std::string error;
  
  // For memory management - platform adapter owns this
  std::shared_ptr<void> platformHandle;
};

struct ImageRegion {
  float left{0.0f};
  float top{0.0f};
  float width{0.0f};
  float height{0.0f};
};

struct PixelRect {
  int x{0};
  int y{0};
  int width{0};
  int height{0};
};

inline PixelRect PixelRectFromNormalized(
    const ImageRegion &region,
    int imageWidth,
    int imageHeight) {
  if (imageWidth <= 0 || imageHeight <= 0) {
    return {};
  }
  const float left = std::clamp(region.left, 0.0f, 1.0f);
  const float top = std::clamp(region.top, 0.0f, 1.0f);
  const float right = std::clamp(region.left + region.width, 0.0f, 1.0f);
  const float bottom = std::clamp(region.top + region.height, 0.0f, 1.0f);
  int x = static_cast<int>(std::floor(left * static_cast<float>(imageWidth)));
  int y = static_cast<int>(std::floor(top * static_cast<float>(imageHeight)));
  int x2 = static_cast<int>(std::ceil(right * static_cast<float>(imageWidth)));
  int y2 = static_cast<int>(std::ceil(bottom * static_cast<float>(imageHeight)));
  x = std::clamp(x, 0, imageWidth - 1);
  y = std::clamp(y, 0, imageHeight - 1);
  x2 = std::clamp(x2, x + 1, imageWidth);
  y2 = std::clamp(y2, y + 1, imageHeight);
  return {x, y, x2 - x, y2 - y};
}

// Thumbnail longest-edge so the region's crop is ~cropOutputMaxPixelSize.
// Tiny faces still need sourceMaxPixelSize (4096); large faces stay near 768–2048.
inline int MeasurementSourcePixelSize(
    const ImageRegion &region,
    int sourceMaxPixelSize,
    int cropOutputMaxPixelSize) {
  const float faceLongEdge = std::max(region.width, region.height);
  const int outputCap = std::max(cropOutputMaxPixelSize, 1);
  const int sourceCap = std::max(sourceMaxPixelSize, outputCap);
  if (faceLongEdge <= 1e-6f) {
    return sourceCap;
  }
  const int needed = static_cast<int>(
      std::ceil(static_cast<float>(outputCap) / faceLongEdge));
  return std::clamp(needed, outputCap, sourceCap);
}

// EXIF orientation 1–8. Face boxes live in oriented (display) space;
// WIC BitmapTransform.Bounds is encoded pixel space before rotation.
inline void MapOrientedPointToEncoded(
    int x,
    int y,
    int orientedWidth,
    int orientedHeight,
    int exifOrientation,
    int &encodedX,
    int &encodedY) {
  switch (exifOrientation) {
  case 2:
    encodedX = orientedWidth - 1 - x;
    encodedY = y;
    return;
  case 3:
    encodedX = orientedWidth - 1 - x;
    encodedY = orientedHeight - 1 - y;
    return;
  case 4:
    encodedX = x;
    encodedY = orientedHeight - 1 - y;
    return;
  case 5:
    encodedX = y;
    encodedY = x;
    return;
  case 6:
    encodedX = y;
    encodedY = orientedWidth - 1 - x;
    return;
  case 7:
    encodedX = orientedHeight - 1 - y;
    encodedY = orientedWidth - 1 - x;
    return;
  case 8:
    encodedX = orientedHeight - 1 - y;
    encodedY = x;
    return;
  default:
    encodedX = x;
    encodedY = y;
    return;
  }
}

inline PixelRect MapOrientedPixelRectToEncoded(
    const PixelRect &orientedRect,
    int orientedWidth,
    int orientedHeight,
    int encodedWidth,
    int encodedHeight,
    int exifOrientation) {
  if (orientedWidth <= 0 || orientedHeight <= 0 || encodedWidth <= 0 ||
      encodedHeight <= 0 || orientedRect.width <= 0 || orientedRect.height <= 0) {
    return {};
  }

  const int x1 = orientedRect.x;
  const int y1 = orientedRect.y;
  const int x2 = orientedRect.x + orientedRect.width - 1;
  const int y2 = orientedRect.y + orientedRect.height - 1;
  const int corners[4][2] = {{x1, y1}, {x2, y1}, {x1, y2}, {x2, y2}};

  int minX = encodedWidth;
  int minY = encodedHeight;
  int maxX = 0;
  int maxY = 0;
  for (const auto &corner : corners) {
    int encodedX = 0;
    int encodedY = 0;
    MapOrientedPointToEncoded(
        corner[0],
        corner[1],
        orientedWidth,
        orientedHeight,
        exifOrientation,
        encodedX,
        encodedY);
    minX = std::min(minX, encodedX);
    minY = std::min(minY, encodedY);
    maxX = std::max(maxX, encodedX);
    maxY = std::max(maxY, encodedY);
  }

  minX = std::clamp(minX, 0, encodedWidth - 1);
  minY = std::clamp(minY, 0, encodedHeight - 1);
  maxX = std::clamp(maxX, minX, encodedWidth - 1);
  maxY = std::clamp(maxY, minY, encodedHeight - 1);
  return {minX, minY, maxX - minX + 1, maxY - minY + 1};
}

// Abstract interface for platform-specific image decoding and EXIF reading
class PlatformDecoder {
public:
  virtual ~PlatformDecoder() = default;

  // Decode image URI to BGRA pixels (max 2048 on longest edge by default).
  // Platform adapter downscales at decode time (ImageIO / WIC).
  virtual DecodedImage DecodeImageToBgra(const std::string &uri, int maxPixelSize = 2048) = 0;

  // Regional decode: load only each crop into BGRA (longest edge ~768).
  // Never materialize a full-frame 4096 BGRA in our heaps.
  virtual std::vector<DecodedImage> DecodeImageRegionsToBgra(
      const std::string &uri,
      const std::vector<ImageRegion> &regions,
      int sourceMaxPixelSize) = 0;

  // Read capture timestamp from image EXIF data
  // Returns milliseconds since Unix epoch, or 0 if not available
  virtual int64_t ReadCapturedAtMillis(const std::string &uri) = 0;

  // Get the database path for this platform
  virtual std::string GetDatabasePath() const = 0;
};

} // namespace Analysis
