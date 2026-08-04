#pragma once

#include <cstdint>
#include <optional>
#include <string>

namespace FaceDetection {

/// Longest-edge cap for face analysis + perceptual hash. Keep macOS/Windows lockstep.
constexpr int kAnalysisMaxPixelSize = 4096;

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
