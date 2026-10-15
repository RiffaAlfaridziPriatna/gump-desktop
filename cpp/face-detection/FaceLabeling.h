#pragma once

#include "FaceDetectionPipeline.h"

#include <string>
#include <vector>

namespace FaceDetection {

constexpr float kEyeOpenConfidenceThreshold = 70.0f;
constexpr float kEyeClosedConfidenceThreshold = 88.0f;
// Non-large faces: size-scaled "sure closed" lid bars (crowd crop noise).
// Tiny area → near-zero lids; near large gate → slightly looser.
constexpr float kSmallFaceAreaFloor = 0.001f;
constexpr float kSmallFaceSureClosedMaxAtFloor = 0.02f;
constexpr float kSmallFaceSureClosedMinAtFloor = 0.015f;
constexpr float kSmallFaceSureClosedMaxAtLarge = 0.045f;
constexpr float kSmallFaceSureClosedMinAtLarge = 0.03f;
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
// Two glare bands (stb path). Deep: peer lid ~shut (WWW03212 glasses
// ~0.045/0.81). Mid: classic shut+reflection (~0.26/0.93). Gap 0.10–0.20
// excludes TR5_1080 speaker asymmetry (~0.145/0.86).
constexpr float kLargeFrontalGlareDeepMinMax = 0.10f;
constexpr float kLargeFrontalGlareDeepMaxMin = 0.78f;
constexpr float kLargeFrontalGlareDeepAvg = 0.55f;
constexpr float kLargeFrontalGlareDeepAsym = 0.55f;
constexpr float kLargeFrontalGlareMidMinFloor = 0.20f;
constexpr float kLargeFrontalGlareMidMin = 0.50f;
constexpr float kLargeFrontalGlareMidMaxMin = 0.88f;
constexpr float kLargeFrontalGlareMidAvg = 0.72f;
constexpr float kLargeFrontalGlareMidAsym = 0.35f;

std::string ClassifyFocusLevel(float sharpness);

// faceArea = width*height in normalized image space; <0 skips size-aware path.
std::string ClassifyEyeStatus(const EyesOpenResult &eyesOpen,
                              float faceArea = -1.0f);

void ApplyCrowdPartialEyeBudget(std::vector<FaceResult> &faces,
                                int target = kCrowdPartialTarget);

void ApplyProductEyeAndFocusLabels(std::vector<FaceResult> &faces);

} // namespace FaceDetection
