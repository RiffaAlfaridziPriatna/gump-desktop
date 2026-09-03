#pragma once

#include "../face-detection/FaceDetectionPipeline.h"

#include <vector>

namespace Analysis {

struct PhotoFlags {
  bool aiSelected{false};
  bool maybe{false};
  bool blurred{false};
  bool closedEyes{false};
  bool selected{false};
};

enum class FaceTier : int {
  Low = 0,
  Medium = 1,
  Good = 2
};

PhotoFlags DerivePhotoFlags(const std::vector<FaceDetection::FaceResult> &faces);

int DeriveStarRating(const std::vector<FaceDetection::FaceResult> &faces);

FaceTier ComputeFaceTier(const FaceDetection::FaceResult &face);

} // namespace Analysis
