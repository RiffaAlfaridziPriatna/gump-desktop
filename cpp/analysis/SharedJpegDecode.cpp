#include "SharedJpegDecode.h"

#include <algorithm>
#include <cctype>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <utility>
#include <vector>

#define STB_IMAGE_IMPLEMENTATION
#define STBI_ONLY_JPEG
#define STBI_NO_THREAD_LOCALS
#include "stb_image.h"

namespace Analysis {
namespace {

std::string ToLowerExt(const std::string &path) {
  const auto slash = path.find_last_of("/\\");
  const auto dot = path.find_last_of('.');
  if (dot == std::string::npos || (slash != std::string::npos && dot < slash)) {
    return {};
  }
  std::string ext = path.substr(dot);
  for (char &ch : ext) {
    ch = static_cast<char>(std::tolower(static_cast<unsigned char>(ch)));
  }
  return ext;
}

bool ReadEntireFile(const std::string &path, std::vector<uint8_t> &bytes, std::string *error) {
#if defined(_WIN32)
  std::ifstream in(std::filesystem::path(path).wstring(), std::ios::binary);
#else
  std::ifstream in(path, std::ios::binary);
#endif
  if (!in) {
    if (error) {
      *error = "Failed to open JPEG";
    }
    return false;
  }
  in.seekg(0, std::ios::end);
  const std::streamoff size = in.tellg();
  if (size <= 0) {
    if (error) {
      *error = "Empty JPEG";
    }
    return false;
  }
  in.seekg(0, std::ios::beg);
  bytes.resize(static_cast<size_t>(size));
  if (!in.read(reinterpret_cast<char *>(bytes.data()), size)) {
    if (error) {
      *error = "Failed to read JPEG";
    }
    return false;
  }
  return true;
}

// Minimal EXIF orientation (tag 0x0112) from JPEG APP1. Default 1.
int ReadJpegExifOrientation(const uint8_t *data, size_t size) {
  if (data == nullptr || size < 4 || data[0] != 0xFF || data[1] != 0xD8) {
    return 1;
  }
  size_t i = 2;
  while (i + 4 < size) {
    if (data[i] != 0xFF) {
      ++i;
      continue;
    }
    while (i < size && data[i] == 0xFF) {
      ++i;
    }
    if (i >= size) {
      break;
    }
    const uint8_t marker = data[i++];
    if (marker == 0xD9 || marker == 0xDA) {
      break;
    }
    if (i + 1 >= size) {
      break;
    }
    const size_t segLen = (static_cast<size_t>(data[i]) << 8) | data[i + 1];
    if (segLen < 2 || i + segLen > size) {
      break;
    }
    if (marker == 0xE1 && segLen >= 8) {
      const uint8_t *app1 = data + i + 2;
      const size_t app1Len = segLen - 2;
      if (app1Len >= 6 &&
          app1[0] == 'E' && app1[1] == 'x' && app1[2] == 'i' && app1[3] == 'f' &&
          app1[4] == 0 && app1[5] == 0) {
        const uint8_t *tiff = app1 + 6;
        const size_t tiffLen = app1Len - 6;
        if (tiffLen < 8) {
          return 1;
        }
        const bool little = tiff[0] == 'I' && tiff[1] == 'I';
        const bool big = tiff[0] == 'M' && tiff[1] == 'M';
        if (!little && !big) {
          return 1;
        }
        auto rd16 = [&](size_t off) -> uint16_t {
          if (off + 1 >= tiffLen) {
            return 0;
          }
          return little ? static_cast<uint16_t>(tiff[off] | (tiff[off + 1] << 8))
                        : static_cast<uint16_t>((tiff[off] << 8) | tiff[off + 1]);
        };
        auto rd32 = [&](size_t off) -> uint32_t {
          if (off + 3 >= tiffLen) {
            return 0;
          }
          return little ? static_cast<uint32_t>(
                              tiff[off] | (tiff[off + 1] << 8) | (tiff[off + 2] << 16) |
                              (tiff[off + 3] << 24))
                        : static_cast<uint32_t>(
                              (tiff[off] << 24) | (tiff[off + 1] << 16) |
                              (tiff[off + 2] << 8) | tiff[off + 3]);
        };
        const uint32_t ifd0 = rd32(4);
        if (ifd0 + 2 > tiffLen) {
          return 1;
        }
        const uint16_t entries = rd16(ifd0);
        for (uint16_t e = 0; e < entries; ++e) {
          const size_t entry = ifd0 + 2 + static_cast<size_t>(e) * 12;
          if (entry + 12 > tiffLen) {
            break;
          }
          if (rd16(entry) == 0x0112) {
            const uint16_t orient = rd16(entry + 8);
            if (orient >= 1 && orient <= 8) {
              return static_cast<int>(orient);
            }
            return 1;
          }
        }
      }
    }
    i += segLen;
  }
  return 1;
}

void RgbToBgra(
    const uint8_t *rgb,
    int width,
    int height,
    FaceDetection::OwnedBgra &out) {
  out.width = width;
  out.height = height;
  out.stride = width * 4;
  out.bytes.resize(static_cast<size_t>(out.stride) * static_cast<size_t>(height));
  for (int y = 0; y < height; ++y) {
    const uint8_t *src = rgb + static_cast<size_t>(y) * static_cast<size_t>(width) * 3;
    uint8_t *dst = out.bytes.data() + static_cast<size_t>(y) * static_cast<size_t>(out.stride);
    for (int x = 0; x < width; ++x) {
      dst[x * 4 + 0] = src[x * 3 + 2];
      dst[x * 4 + 1] = src[x * 3 + 1];
      dst[x * 4 + 2] = src[x * 3 + 0];
      dst[x * 4 + 3] = 255;
    }
  }
}

bool ApplyExifOrientation(FaceDetection::OwnedBgra &img, int orientation) {
  if (orientation <= 1 || orientation > 8) {
    return true;
  }
  const int w = img.width;
  const int h = img.height;
  FaceDetection::OwnedBgra out;
  const auto sample = [&](int x, int y, uint8_t *dst4) {
    const uint8_t *p = img.bytes.data() + y * img.stride + x * 4;
    dst4[0] = p[0];
    dst4[1] = p[1];
    dst4[2] = p[2];
    dst4[3] = p[3];
  };

  auto emit = [&](int dstW, int dstH, auto mapFn) {
    out.width = dstW;
    out.height = dstH;
    out.stride = dstW * 4;
    out.bytes.resize(static_cast<size_t>(out.stride) * static_cast<size_t>(dstH));
    for (int y = 0; y < dstH; ++y) {
      for (int x = 0; x < dstW; ++x) {
        int sx = 0;
        int sy = 0;
        mapFn(x, y, sx, sy);
        sample(sx, sy, out.bytes.data() + y * out.stride + x * 4);
      }
    }
  };

  switch (orientation) {
  case 2: // mirror horizontal
    emit(w, h, [&](int x, int y, int &sx, int &sy) {
      sx = w - 1 - x;
      sy = y;
    });
    break;
  case 3: // 180
    emit(w, h, [&](int x, int y, int &sx, int &sy) {
      sx = w - 1 - x;
      sy = h - 1 - y;
    });
    break;
  case 4: // mirror vertical
    emit(w, h, [&](int x, int y, int &sx, int &sy) {
      sx = x;
      sy = h - 1 - y;
    });
    break;
  case 5: // mirror horizontal + rotate 270 CW
    emit(h, w, [&](int x, int y, int &sx, int &sy) {
      sx = y;
      sy = x;
    });
    break;
  case 6: // 90 CW
    emit(h, w, [&](int x, int y, int &sx, int &sy) {
      sx = y;
      sy = h - 1 - x;
    });
    break;
  case 7: // mirror horizontal + rotate 90 CW
    emit(h, w, [&](int x, int y, int &sx, int &sy) {
      sx = w - 1 - y;
      sy = h - 1 - x;
    });
    break;
  case 8: // 270 CW
    emit(h, w, [&](int x, int y, int &sx, int &sy) {
      sx = w - 1 - y;
      sy = x;
    });
    break;
  default:
    return true;
  }
  img = std::move(out);
  return true;
}

bool DecodeJpegBytesToOrientedBgra(
    const std::vector<uint8_t> &bytes,
    FaceDetection::OwnedBgra &out,
    std::string *error) {
  int width = 0;
  int height = 0;
  int comp = 0;
  unsigned char *rgb = stbi_load_from_memory(
      bytes.data(),
      static_cast<int>(bytes.size()),
      &width,
      &height,
      &comp,
      3);
  if (rgb == nullptr || width <= 0 || height <= 0) {
    if (error) {
      *error = stbi_failure_reason() ? stbi_failure_reason() : "stbi JPEG decode failed";
    }
    if (rgb) {
      stbi_image_free(rgb);
    }
    return false;
  }
  RgbToBgra(rgb, width, height, out);
  stbi_image_free(rgb);
  const int orientation = ReadJpegExifOrientation(bytes.data(), bytes.size());
  ApplyExifOrientation(out, orientation);
  return true;
}

} // namespace

bool IsJpegPath(const std::string &path) {
  const std::string ext = ToLowerExt(path);
  return ext == ".jpg" || ext == ".jpeg" || ext == ".jpe" || ext == ".jfif";
}

bool DecodeJpegFileToOrientedBgra(
    const std::string &path,
    FaceDetection::OwnedBgra &out,
    std::string *error) {
  out = {};
  if (!IsJpegPath(path)) {
    if (error) {
      *error = "Not a JPEG path";
    }
    return false;
  }
  std::vector<uint8_t> bytes;
  if (!ReadEntireFile(path, bytes, error)) {
    return false;
  }
  return DecodeJpegBytesToOrientedBgra(bytes, out, error);
}

bool DecodeJpegFileToBgra(
    const std::string &path,
    int maxLongEdge,
    FaceDetection::OwnedBgra &out,
    std::string *error) {
  out = {};
  FaceDetection::OwnedBgra full;
  if (!DecodeJpegFileToOrientedBgra(path, full, error)) {
    return false;
  }
  const int cap = std::max(maxLongEdge, 1);
  if (!FaceDetection::resizeBgraLongEdge(
          full.bytes.data(), full.width, full.height, full.stride, cap, out)) {
    if (error) {
      *error = "Resize failed";
    }
    return false;
  }
  return true;
}

bool CropOrientedBgraRegion(
    const FaceDetection::OwnedBgra &orientedFull,
    const ImageRegion &region,
    int sourceMaxPixelSize,
    int cropOutputMaxPixelSize,
    FaceDetection::OwnedBgra &out,
    std::string *error) {
  out = {};
  if (orientedFull.bytes.empty() || orientedFull.width <= 0 ||
      orientedFull.height <= 0) {
    if (error) {
      *error = "Empty oriented frame";
    }
    return false;
  }
  const int sourceMax = MeasurementSourcePixelSize(
      region, sourceMaxPixelSize, cropOutputMaxPixelSize);
  FaceDetection::OwnedBgra scaled;
  if (!FaceDetection::resizeBgraLongEdge(
          orientedFull.bytes.data(),
          orientedFull.width,
          orientedFull.height,
          orientedFull.stride,
          sourceMax,
          scaled)) {
    if (error) {
      *error = "Region source resize failed";
    }
    return false;
  }
  const PixelRect rect =
      PixelRectFromNormalized(region, scaled.width, scaled.height);
  if (rect.width <= 0 || rect.height <= 0) {
    if (error) {
      *error = "Empty crop region";
    }
    return false;
  }
  if (!FaceDetection::cropBgra(
          scaled.bytes.data(),
          scaled.width,
          scaled.height,
          scaled.stride,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          out)) {
    if (error) {
      *error = "Crop failed";
    }
    return false;
  }
  return true;
}

} // namespace Analysis
