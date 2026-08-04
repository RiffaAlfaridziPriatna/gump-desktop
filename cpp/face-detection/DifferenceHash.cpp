#include "DifferenceHash.h"

#include <algorithm>
#include <cmath>
#include <cstdio>

namespace FaceDetection {
namespace {

uint8_t BgraToLuma(uint8_t b, uint8_t g, uint8_t r) {
  // BT.601 luma — identical weights on macOS and Windows.
  return static_cast<uint8_t>(b * 0.114 + g * 0.587 + r * 0.299);
}

} // namespace

std::optional<uint64_t> differenceHashFromBgra(
    const uint8_t *bgraPixels,
    int imageWidth,
    int imageHeight,
    int stride) {
  if (bgraPixels == nullptr || imageWidth <= 0 || imageHeight <= 0 || stride < imageWidth * 4) {
    return std::nullopt;
  }

  uint8_t gray[72]{};
  for (int y = 0; y < 8; ++y) {
    for (int x = 0; x < 9; ++x) {
      const double sourceX = (x + 0.5) * imageWidth / 9.0 - 0.5;
      const double sourceY = (y + 0.5) * imageHeight / 8.0 - 0.5;
      const int pixelX =
          std::clamp(static_cast<int>(std::round(sourceX)), 0, imageWidth - 1);
      const int pixelY =
          std::clamp(static_cast<int>(std::round(sourceY)), 0, imageHeight - 1);
      const int index = pixelY * stride + pixelX * 4;
      gray[y * 9 + x] = BgraToLuma(
          bgraPixels[index], bgraPixels[index + 1], bgraPixels[index + 2]);
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

std::string formatHashHex(uint64_t hash) {
  char buffer[17]{};
  std::snprintf(buffer, sizeof(buffer), "%016llx", static_cast<unsigned long long>(hash));
  return buffer;
}

} // namespace FaceDetection
