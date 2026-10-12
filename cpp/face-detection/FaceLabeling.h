#pragma once

#include "FaceDetectionPipeline.h"

#include <string>
#include <vector>

namespace FaceDetection {

constexpr float kEyeOpenConfidenceThreshold = 70.0f;
constexpr float kEyeClosedConfidenceThreshold = 88.0f;
constexpr float kFocusGoodThreshold = 65.0f;
constexpr float kFocusSoftThreshold = 40.0f;
constexpr int kCrowdPartialTarget = 5;
constexpr float kCrowdPartialMaxFaceArea = 0.001f;
// Match FaceDetectionPipeline large-frontal OCEC three-way remap.
constexpr float kLargeFrontalFaceArea = 0.008f;
constexpr float kLargeFrontalOpenMin = 0.92f;
constexpr float kLargeFrontalOpenAvg = 0.92f;
constexpr float kLargeFrontalClosedMax = 0.18f;
constexpr float kLargeFrontalClosedMin = 0.12f;
constexpr float kLargeFrontalSoftClosedMin = 0.55f;
constexpr float kLargeFrontalSoftClosedMinFloor = 0.45f;
constexpr float kLargeFrontalSoftClosedAvg = 0.70f;
constexpr float kLargeFrontalSoftClosedMax = 0.88f;
constexpr float kLargeFrontalSoftClosedAsym = 0.28f;

std::string ClassifyFocusLevel(float sharpness);

// faceArea = width*height in normalized image space; <0 skips size-aware path.
std::string ClassifyEyeStatus(const EyesOpenResult &eyesOpen,
                              float faceArea = -1.0f);

void ApplyCrowdPartialEyeBudget(std::vector<FaceResult> &faces,
                                int target = kCrowdPartialTarget);

void ApplyProductEyeAndFocusLabels(std::vector<FaceResult> &faces);

} // namespace FaceDetection
