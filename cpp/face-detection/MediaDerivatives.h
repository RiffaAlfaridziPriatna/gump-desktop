#pragma once

#include <cstdint>

namespace MediaDerivatives {

// Thumbnail and JPEG quality
constexpr uint32_t kThumbnailMaxPixelSize = 1920;
constexpr float kThumbnailJpegQuality = 0.82f;

// Detail derivative: generated on demand for the photo detail viewer, where
// zooming into a face needs more pixels than the grid thumbnail carries.
constexpr uint32_t kDetailMaxPixelSize = 4096;
constexpr float kDetailJpegQuality = 0.90f;

// Face crop padding and output
constexpr float kFaceCropSidePadding = 0.3f;
constexpr float kFaceCropTopPadding = 0.3f;
constexpr float kFaceCropBottomPadding = 0.5f;
constexpr uint32_t kFaceCropOutputPixelSize = 128;

// Face crop rect structure
struct FaceCropRect {
  int left{0};
  int top{0};
  int width{0};
  int height{0};
};

// Compute padded face crop rect with standard padding
FaceCropRect ComputePaddedFaceCropRect(
    int imageWidth,
    int imageHeight,
    float boxLeft,
    float boxTop,
    float boxWidth,
    float boxHeight);

// Center-crop rect to square for face thumbnails
FaceCropRect MakeSquareCoverCrop(const FaceCropRect &rect);

}  // namespace MediaDerivatives
