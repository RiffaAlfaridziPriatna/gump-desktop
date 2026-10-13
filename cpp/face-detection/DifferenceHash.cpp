#include "DifferenceHash.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>

namespace FaceDetection {
namespace {

uint8_t BgraToLuma(uint8_t b, uint8_t g, uint8_t r) {
  // BT.601 luma — identical weights on macOS and Windows.
  return static_cast<uint8_t>(b * 0.114 + g * 0.587 + r * 0.299);
}

float ClampFloat(float value, float minimum, float maximum) {
  return std::max(minimum, std::min(maximum, value));
}

void SampleBilinearBgra(
    const uint8_t *bgra,
    int width,
    int height,
    int stride,
    float x,
    float y,
    uint8_t *out4) {
  const float cx = ClampFloat(x, 0.0f, static_cast<float>(width - 1));
  const float cy = ClampFloat(y, 0.0f, static_cast<float>(height - 1));
  const int x0 = static_cast<int>(std::floor(cx));
  const int y0 = static_cast<int>(std::floor(cy));
  const int x1 = std::min(width - 1, x0 + 1);
  const int y1 = std::min(height - 1, y0 + 1);
  const float fx = cx - static_cast<float>(x0);
  const float fy = cy - static_cast<float>(y0);
  const float w00 = (1.0f - fx) * (1.0f - fy);
  const float w10 = fx * (1.0f - fy);
  const float w01 = (1.0f - fx) * fy;
  const float w11 = fx * fy;
  const uint8_t *p00 = bgra + y0 * stride + x0 * 4;
  const uint8_t *p10 = bgra + y0 * stride + x1 * 4;
  const uint8_t *p01 = bgra + y1 * stride + x0 * 4;
  const uint8_t *p11 = bgra + y1 * stride + x1 * 4;
  for (int c = 0; c < 4; ++c) {
    const float mixed = p00[c] * w00 + p10[c] * w10 + p01[c] * w01 + p11[c] * w11;
    out4[c] = static_cast<uint8_t>(std::lround(ClampFloat(mixed, 0.0f, 255.0f)));
  }
}

} // namespace

bool cropBgra(
    const uint8_t *bgraPixels,
    int imageWidth,
    int imageHeight,
    int stride,
    int x,
    int y,
    int width,
    int height,
    OwnedBgra &out) {
  out = {};
  if (bgraPixels == nullptr || imageWidth <= 0 || imageHeight <= 0 ||
      stride < imageWidth * 4 || width <= 0 || height <= 0) {
    return false;
  }
  const int x0 = std::clamp(x, 0, imageWidth - 1);
  const int y0 = std::clamp(y, 0, imageHeight - 1);
  const int x1 = std::clamp(x + width, x0 + 1, imageWidth);
  const int y1 = std::clamp(y + height, y0 + 1, imageHeight);
  const int cropW = x1 - x0;
  const int cropH = y1 - y0;
  out.width = cropW;
  out.height = cropH;
  out.stride = cropW * 4;
  out.bytes.resize(static_cast<size_t>(out.stride) * static_cast<size_t>(cropH));
  for (int row = 0; row < cropH; ++row) {
    const uint8_t *src = bgraPixels + (y0 + row) * stride + x0 * 4;
    uint8_t *dst = out.bytes.data() + row * out.stride;
    std::memcpy(dst, src, static_cast<size_t>(out.stride));
  }
  return true;
}

bool resizeBgraLongEdge(
    const uint8_t *bgraPixels,
    int imageWidth,
    int imageHeight,
    int stride,
    int maxLongEdge,
    OwnedBgra &out) {
  out = {};
  if (bgraPixels == nullptr || imageWidth <= 0 || imageHeight <= 0 ||
      stride < imageWidth * 4 || maxLongEdge <= 0) {
    return false;
  }
  const int longEdge = std::max(imageWidth, imageHeight);
  if (longEdge <= maxLongEdge) {
    out.width = imageWidth;
    out.height = imageHeight;
    out.stride = imageWidth * 4;
    out.bytes.resize(static_cast<size_t>(out.stride) * static_cast<size_t>(imageHeight));
    if (stride == out.stride) {
      std::memcpy(
          out.bytes.data(),
          bgraPixels,
          out.bytes.size());
    } else {
      for (int row = 0; row < imageHeight; ++row) {
        std::memcpy(
            out.bytes.data() + row * out.stride,
            bgraPixels + row * stride,
            static_cast<size_t>(out.stride));
      }
    }
    return true;
  }

  const float scale = static_cast<float>(maxLongEdge) / static_cast<float>(longEdge);
  const int dstW = std::max(1, static_cast<int>(std::lround(imageWidth * scale)));
  const int dstH = std::max(1, static_cast<int>(std::lround(imageHeight * scale)));
  out.width = dstW;
  out.height = dstH;
  out.stride = dstW * 4;
  out.bytes.resize(static_cast<size_t>(out.stride) * static_cast<size_t>(dstH));
  const float scaleX = static_cast<float>(imageWidth) / static_cast<float>(dstW);
  const float scaleY = static_cast<float>(imageHeight) / static_cast<float>(dstH);
  for (int y = 0; y < dstH; ++y) {
    const float srcY = (static_cast<float>(y) + 0.5f) * scaleY - 0.5f;
    uint8_t *dstRow = out.bytes.data() + y * out.stride;
    for (int x = 0; x < dstW; ++x) {
      const float srcX = (static_cast<float>(x) + 0.5f) * scaleX - 0.5f;
      SampleBilinearBgra(
          bgraPixels, imageWidth, imageHeight, stride, srcX, srcY, dstRow + x * 4);
    }
  }
  return true;
}

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
