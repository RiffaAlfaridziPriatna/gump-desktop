#pragma once

#include <cstdint>
#include <optional>
#include <string>

namespace FaceDetection {

/// Longest-edge cap for SCRFD + tiling + dHash. Keep macOS/Windows lockstep.
constexpr int kAnalysisMaxPixelSize = 4096;
/// Longest-edge cap when rasterizing hi-res face crops for sharpness / OCEC / EAR.
constexpr int kMeasurementMaxPixelSize = 4096;
/// Longest-edge of each measurement crop after regional decode. OCEC/EAR
/// operate on a small face window; do not keep a full-frame 4096 BGRA.
constexpr int kMeasurementCropOutputMaxPixelSize = 768;

/// 64-bit difference hash (dHash) from a BGRA8 buffer.
/// Both desktop platforms must call this on the *same* analysis-sized buffer used
/// for SCRFD so duplicate grouping stays cross-platform consistent.
std::optional<uint64_t> differenceHashFromBgra(
    const uint8_t *bgraPixels,
    int imageWidth,
    int imageHeight,
    int stride);

std::string formatHashHex(uint64_t hash);

} // namespace FaceDetection
