#pragma once

#include "DifferenceHash.h"
#include "PlatformDecoder.h"

#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace Analysis {

/// True when path looks like JPEG (extension). HEIC/PNG stay on ImageIO/WIC.
bool IsJpegPath(const std::string &path);

/// JPEG → oriented BGRA. When maxLongEdge > 0, IDCT-scales (libjpeg 1/1–1/8)
/// then bilinear-caps so the longest edge is <= maxLongEdge. maxLongEdge <= 0
/// keeps full resolution (stb fallback path only when scaled decode fails).
bool DecodeJpegFileToOrientedBgra(
    const std::string &path,
    FaceDetection::OwnedBgra &out,
    std::string *error,
    int maxLongEdge = 0);

/// Shared lib path: file → JPEG decode → EXIF orient → longest-edge shrink → BGRA.
/// Used by macOS + Windows analysis so SCRFD/OCEC see the same pixels.
bool DecodeJpegFileToBgra(
    const std::string &path,
    int maxLongEdge,
    FaceDetection::OwnedBgra &out,
    std::string *error);

/// From an already-oriented frame: bilinear to sourceMax, then crop region.
bool CropOrientedBgraRegion(
    const FaceDetection::OwnedBgra &orientedFull,
    const ImageRegion &region,
    int sourceMaxPixelSize,
    int cropOutputMaxPixelSize,
    FaceDetection::OwnedBgra &out,
    std::string *error);

/// Per-decoder JPEG frame cache: one oriented buffer per path at a given
/// long-edge cap. Removes the second full decode (detect → eye crops).
class JpegDecodeCache {
public:
  /// Returns oriented BGRA with longest edge <= maxLongEdge (scaled decode).
  /// Reuses a cached frame when it is large enough; otherwise (re)decodes.
  bool GetOriented(
      const std::string &path,
      int maxLongEdge,
      std::shared_ptr<FaceDetection::OwnedBgra> &out,
      std::string *error);

  void Clear();

private:
  struct Entry {
    int maxLongEdge{0};
    std::shared_ptr<FaceDetection::OwnedBgra> frame;
  };

  std::mutex mutex_;
  std::unordered_map<std::string, Entry> entries_;
};

} // namespace Analysis
