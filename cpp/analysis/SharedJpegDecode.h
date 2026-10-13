#pragma once

#include "DifferenceHash.h"
#include "PlatformDecoder.h"

#include <cstdint>
#include <string>
#include <vector>

namespace Analysis {

/// True when path looks like JPEG (extension). HEIC/PNG stay on ImageIO/WIC.
bool IsJpegPath(const std::string &path);

/// Full-resolution JPEG → BGRA with EXIF orientation applied (no long-edge shrink).
bool DecodeJpegFileToOrientedBgra(
    const std::string &path,
    FaceDetection::OwnedBgra &out,
    std::string *error);

/// Shared lib path: file → JPEG decode → EXIF orient → longest-edge shrink → BGRA.
/// Used by macOS + Windows analysis so SCRFD/OCEC see the same pixels.
bool DecodeJpegFileToBgra(
    const std::string &path,
    int maxLongEdge,
    FaceDetection::OwnedBgra &out,
    std::string *error);

/// From an already-oriented full frame: bilinear to sourceMax, then crop region.
bool CropOrientedBgraRegion(
    const FaceDetection::OwnedBgra &orientedFull,
    const ImageRegion &region,
    int sourceMaxPixelSize,
    int cropOutputMaxPixelSize,
    FaceDetection::OwnedBgra &out,
    std::string *error);

} // namespace Analysis
