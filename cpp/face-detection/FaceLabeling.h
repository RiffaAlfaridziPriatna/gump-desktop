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

std::string ClassifyFocusLevel(float sharpness);

std::string ClassifyEyeStatus(const EyesOpenResult &eyesOpen);

void ApplyCrowdPartialEyeBudget(std::vector<FaceResult> &faces,
                                int target = kCrowdPartialTarget);

void ApplyProductEyeAndFocusLabels(std::vector<FaceResult> &faces);

} // namespace FaceDetection
