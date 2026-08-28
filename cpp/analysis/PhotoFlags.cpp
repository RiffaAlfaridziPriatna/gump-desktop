#include "PhotoFlags.h"

#include <algorithm>
#include <numeric>

namespace Analysis {

PhotoFlags DerivePhotoFlags(const std::vector<FaceDetection::FaceResult> &faces) {
  if (faces.empty()) {
    return PhotoFlags{};
  }

  bool closedEyes = std::any_of(faces.begin(), faces.end(), [](const auto &face) {
    return face.eyeStatus == "closed";
  });

  bool hasPartial = std::any_of(faces.begin(), faces.end(), [](const auto &face) {
    return face.eyeStatus == "partial";
  });

  bool blurred = std::any_of(faces.begin(), faces.end(), [](const auto &face) {
    return face.focusLevel == "blurred";
  });

  bool hasSoft = std::any_of(faces.begin(), faces.end(), [](const auto &face) {
    return face.focusLevel == "soft";
  });

  bool aiSelected = !closedEyes && !blurred && !hasPartial && !hasSoft;
  bool maybe = !closedEyes && !blurred && (hasPartial || hasSoft);

  return PhotoFlags{
      .aiSelected = aiSelected,
      .maybe = maybe,
      .blurred = blurred,
      .closedEyes = closedEyes,
      .selected = aiSelected || maybe
  };
}

FaceTier ComputeFaceTier(const FaceDetection::FaceResult &face) {
  if (face.eyeStatus == "closed" || face.focusLevel == "blurred") {
    return FaceTier::Low;
  }
  if (face.eyeStatus == "open" && face.focusLevel == "good") {
    return FaceTier::Good;
  }
  return FaceTier::Medium;
}

int DeriveStarRating(const std::vector<FaceDetection::FaceResult> &faces) {
  if (faces.empty()) {
    return 0;
  }

  std::vector<FaceTier> tiers;
  tiers.reserve(faces.size());
  for (const auto &face : faces) {
    tiers.push_back(ComputeFaceTier(face));
  }

  bool hasLow = std::any_of(tiers.begin(), tiers.end(), [](FaceTier t) {
    return t == FaceTier::Low;
  });

  bool hasPartialOrSoft = std::any_of(tiers.begin(), tiers.end(), [](FaceTier t) {
    return t == FaceTier::Medium;
  });

  if (!hasLow && !hasPartialOrSoft) {
    return 5;
  }
  if (!hasLow) {
    return 4;
  }

  int sum = std::accumulate(tiers.begin(), tiers.end(), 0,
                           [](int s, FaceTier t) { return s + static_cast<int>(t); });
  double avg = static_cast<double>(sum) / (static_cast<double>(tiers.size()) * 2.0);

  if (avg <= 1.0 / 3.0) {
    return 1;
  }
  if (avg >= 2.0 / 3.0) {
    return 3;
  }
  return 2;
}

} // namespace Analysis
