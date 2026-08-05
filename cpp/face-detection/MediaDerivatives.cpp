#include "MediaDerivatives.h"

#include <algorithm>
#include <cmath>

namespace MediaDerivatives {

FaceCropRect ComputePaddedFaceCropRect(
    int imageWidth,
    int imageHeight,
    float boxLeft,
    float boxTop,
    float boxWidth,
    float boxHeight) {
  const float cropX = boxLeft * static_cast<float>(imageWidth);
  const float cropY = boxTop * static_cast<float>(imageHeight);
  const float cropW = std::max(boxWidth * static_cast<float>(imageWidth), 1.0f);
  const float cropH = std::max(boxHeight * static_cast<float>(imageHeight), 1.0f);

  float viewLeft = cropX - kFaceCropSidePadding * cropW;
  float viewTop = cropY - kFaceCropTopPadding * cropH;
  float viewW = cropW * (1.0f + 2.0f * kFaceCropSidePadding);
  float viewH = cropH * (1.0f + kFaceCropTopPadding + kFaceCropBottomPadding);

  viewLeft = std::max(0.0f, std::min(viewLeft, static_cast<float>(imageWidth - 1)));
  viewTop = std::max(0.0f, std::min(viewTop, static_cast<float>(imageHeight - 1)));
  viewW = std::max(1.0f, std::min(viewW, static_cast<float>(imageWidth) - viewLeft));
  viewH = std::max(1.0f, std::min(viewH, static_cast<float>(imageHeight) - viewTop));

  return FaceCropRect{
      static_cast<int>(std::lround(viewLeft)),
      static_cast<int>(std::lround(viewTop)),
      static_cast<int>(std::lround(viewW)),
      static_cast<int>(std::lround(viewH)),
  };
}

FaceCropRect MakeSquareCoverCrop(const FaceCropRect &rect) {
  if (rect.width <= 0 || rect.height <= 0) {
    return rect;
  }
  if (rect.width == rect.height) {
    return rect;
  }
  if (rect.width > rect.height) {
    const int side = rect.height;
    return FaceCropRect{
        rect.left + (rect.width - side) / 2,
        rect.top,
        side,
        side,
    };
  }
  const int side = rect.width;
  return FaceCropRect{
      rect.left,
      rect.top + (rect.height - side) / 2,
      side,
      side,
  };
}

}  // namespace MediaDerivatives
