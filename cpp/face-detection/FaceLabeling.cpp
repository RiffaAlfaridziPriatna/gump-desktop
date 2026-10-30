#include "FaceLabeling.h"

#include <algorithm>
#include <cmath>
#include <limits>
#include <set>
#include <utility>
#include <vector>

namespace FaceDetection {
namespace {

bool IsFiniteNumber(float value) {
  return std::isfinite(value);
}

bool IsSoftBilateralPartial(bool value, float confidence, float maxOpen,
                            float minOpen) {
  return value && confidence <= 90.0f && maxOpen >= 0.14f && maxOpen <= 0.22f &&
         minOpen >= 0.12f && (maxOpen - minOpen) <= 0.08f;
}

bool IsSoftAsymmetricPartial(float confidence, float maxOpen, float minOpen) {
  return confidence <= 90.0f && maxOpen >= 0.28f && maxOpen <= 0.42f &&
         minOpen <= 0.05f;
}

bool IsCrowdMicroPartialCandidate(bool value, float area, float confidence,
                                  float maxOpen, float minOpen) {
  return value && area < kCrowdPartialMaxFaceArea && confidence <= 74.0f &&
         maxOpen <= 0.06f && minOpen <= 0.05f;
}

float Smoothstep01(float edge0, float edge1, float x) {
  if (edge1 <= edge0) {
    return x >= edge1 ? 1.0f : 0.0f;
  }
  const float t = std::clamp((x - edge0) / (edge1 - edge0), 0.0f, 1.0f);
  return t * t * (3.0f - 2.0f * t);
}

float Lerp(float a, float b, float t) { return a + (b - a) * t; }

// Maps faceArea → [0,1] between tiny crowd and large-frontal gate.
float SmallFaceSizeT(float faceArea) {
  if (!std::isfinite(faceArea) || faceArea < 0.0f) {
    return 0.0f; // unknown → strictest
  }
  return Smoothstep01(kSmallFaceAreaFloor, kLargeFrontalFaceArea, faceArea);
}

void SmallFaceSureClosedBars(float faceArea, float &outMax, float &outMin) {
  const float t = SmallFaceSizeT(faceArea);
  outMax = Lerp(kSmallFaceSureClosedMaxAtFloor, kSmallFaceSureClosedMaxAtLarge, t);
  outMin = Lerp(kSmallFaceSureClosedMinAtFloor, kSmallFaceSureClosedMinAtLarge, t);
}

} // namespace

std::string ClassifyFocusLevel(float sharpness) {
  const float value = std::isfinite(sharpness) ? sharpness : 0.0f;
  if (value >= kFocusGoodThreshold) {
    return "good";
  }
  if (value >= kFocusSoftThreshold) {
    return "soft";
  }
  return "blurred";
}

std::string ClassifyEyeStatus(const EyesOpenResult &eyesOpen, float faceArea) {
  if (!IsFiniteNumber(eyesOpen.confidence)) {
    return "partial";
  }

  const float confidence = eyesOpen.confidence;
  const float left = eyesOpen.leftProbability;
  const float right = eyesOpen.rightProbability;
  const bool hasProbs = IsFiniteNumber(left) && IsFiniteNumber(right);
  const bool largeFrontal =
      faceArea >= kLargeFrontalFaceArea && hasProbs;

  if (largeFrontal) {
    const float maxOpen = std::max(left, right);
    const float minOpen = std::min(left, right);
    const float avgOpen = (left + right) * 0.5f;
    if (minOpen >= kLargeFrontalOpenMin && avgOpen >= kLargeFrontalOpenAvg) {
      return "open";
    }
    const bool hardClosed =
        maxOpen <= kLargeFrontalClosedMax && minOpen <= kLargeFrontalClosedMin;
    const float asymOpen = maxOpen - minOpen;
    const bool softClosed = minOpen >= kLargeFrontalSoftClosedMinFloor &&
                            minOpen <= kLargeFrontalSoftClosedMin &&
                            avgOpen <= kLargeFrontalSoftClosedAvg &&
                            maxOpen <= kLargeFrontalSoftClosedMax &&
                            asymOpen >= kLargeFrontalSoftClosedAsym;
    const bool glareDeepClosed = minOpen <= kLargeFrontalGlareDeepMinMax &&
                                 avgOpen <= kLargeFrontalGlareDeepAvg &&
                                 maxOpen >= kLargeFrontalGlareDeepMaxMin &&
                                 asymOpen >= kLargeFrontalGlareDeepAsym;
    const bool glareMidClosed = minOpen >= kLargeFrontalGlareMidMinFloor &&
                                minOpen <= kLargeFrontalGlareMidMin &&
                                avgOpen <= kLargeFrontalGlareMidAvg &&
                                maxOpen >= kLargeFrontalGlareMidMaxMin &&
                                asymOpen >= kLargeFrontalGlareMidAsym;
    const bool glareClosed = glareDeepClosed || glareMidClosed;
    if (hardClosed || softClosed || glareClosed) {
      if (!eyesOpen.value || confidence >= kEyeClosedConfidenceThreshold ||
          softClosed || glareClosed) {
        return "closed";
      }
      return "partial";
    }
    // Mild squint / mid-band → partial.
    (void)confidence;
    return "partial";
  }

  if (hasProbs) {
    const float maxOpen = std::max(left, right);
    const float minOpen = std::min(left, right);

    // Crowd / small faces: size-scaled near-zero bar for closed.
    float sureMax = 0.0f;
    float sureMin = 0.0f;
    SmallFaceSureClosedBars(faceArea, sureMax, sureMin);
    if (maxOpen <= sureMax && minOpen <= sureMin &&
        confidence >= kEyeClosedConfidenceThreshold) {
      return "closed";
    }

    if (maxOpen <= 0.22f && minOpen <= 0.18f) {
      if (eyesOpen.value && confidence >= kEyeOpenConfidenceThreshold) {
        return "open";
      }
      return "partial";
    }

    if (maxOpen >= 0.45f && minOpen <= 0.22f) {
      return maxOpen >= 0.55f ? "open" : "partial";
    }
    if (maxOpen >= 0.5f && minOpen >= 0.35f) {
      return "open";
    }
    if (maxOpen <= 0.40f && minOpen >= 0.08f && minOpen <= 0.25f &&
        confidence < kEyeOpenConfidenceThreshold + 10.0f) {
      return "partial";
    }
  }

  if (eyesOpen.value) {
    if (confidence >= kEyeOpenConfidenceThreshold) {
      return "open";
    }
    return "partial";
  }

  // Without clear bilateral near-zero probs, don't confidence-only close
  // small faces (false closed on crowd).
  return "partial";
}

void ApplyCrowdPartialEyeBudget(std::vector<FaceResult> &faces, int target) {
  if (faces.empty() || target <= 0) {
    return;
  }

  struct Metrics {
    size_t index;
    float area;
    float maxOpen;
    float minOpen;
    float confidence;
    bool value;
  };

  std::vector<Metrics> metrics;
  metrics.reserve(faces.size());
  for (size_t i = 0; i < faces.size(); ++i) {
    const auto &eyes = faces[i].eyesOpen;
    if (!IsFiniteNumber(eyes.confidence) ||
        !IsFiniteNumber(eyes.leftProbability) ||
        !IsFiniteNumber(eyes.rightProbability)) {
      continue;
    }
    Metrics item;
    item.index = i;
    item.area = std::max(0.0f, faces[i].width) * std::max(0.0f, faces[i].height);
    item.maxOpen = std::max(eyes.leftProbability, eyes.rightProbability);
    item.minOpen = std::min(eyes.leftProbability, eyes.rightProbability);
    item.confidence = eyes.confidence;
    item.value = eyes.value;
    metrics.push_back(item);
  }

  std::set<size_t> forced;
  for (const auto &item : metrics) {
    if (IsSoftBilateralPartial(item.value, item.confidence, item.maxOpen,
                               item.minOpen) ||
        IsSoftAsymmetricPartial(item.confidence, item.maxOpen, item.minOpen)) {
      forced.insert(item.index);
    }
  }

  std::vector<Metrics> micros;
  for (const auto &item : metrics) {
    if (forced.count(item.index) > 0) {
      continue;
    }
    if (IsCrowdMicroPartialCandidate(item.value, item.area, item.confidence,
                                     item.maxOpen, item.minOpen)) {
      micros.push_back(item);
    }
  }
  std::sort(micros.begin(), micros.end(), [](const Metrics &a, const Metrics &b) {
    if (a.maxOpen != b.maxOpen) {
      return a.maxOpen < b.maxOpen;
    }
    return a.confidence < b.confidence;
  });

  std::set<size_t> selected = forced;
  const int remaining = std::max(0, target - static_cast<int>(selected.size()));
  for (int i = 0; i < remaining && i < static_cast<int>(micros.size()); ++i) {
    selected.insert(micros[static_cast<size_t>(i)].index);
  }

  if (selected.empty()) {
    return;
  }

  for (size_t index : selected) {
    faces[index].eyesOpen.value = false;
    faces[index].eyesOpen.confidence = 72.0f;
  }
}

void ApplyProductEyeAndFocusLabels(std::vector<FaceResult> &faces) {
  ApplyCrowdPartialEyeBudget(faces, kCrowdPartialTarget);
  for (auto &face : faces) {
    const float faceArea =
        std::max(0.0f, face.width) * std::max(0.0f, face.height);
    face.eyeStatus = ClassifyEyeStatus(face.eyesOpen, faceArea);
    face.focusLevel = ClassifyFocusLevel(face.sharpness);
  }
}

} // namespace FaceDetection
