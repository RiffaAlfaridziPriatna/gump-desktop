#include "FaceDetectionPipeline.h"

#include "FaceLabeling.h"
#include "Landmark106EarClassifier.h"
#include "OcecEyeStateClassifier.h"
#include "ScrfdFaceDetector.h"

#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

namespace FaceDetection {
namespace {

// Spatial dedupe — mirrored from macOS GumpLocalStorage.mm
// Keep nearby distinct faces (Vision often splits close profiles). Soft merge only.
constexpr float kFaceBoxIoUThreshold = 0.55f;
constexpr float kFaceBoxIoSThreshold = 0.70f;
constexpr float kFaceBoxProximityIoUThreshold = 0.32f;
constexpr float kFaceBoxProximityCenterFactor = 0.35f;
constexpr float kFaceBoxProximityMinAreaRatio = 2.4f;

// Tiling — mirrored from macOS collectFaceRectanglesFromCGImage
constexpr float kTileOverlapFraction = 0.35f;
constexpr float kMinPixelsForTiling = 400000;
constexpr size_t kMinFacesToSkipTiling = 3;
constexpr size_t kDenseGroupAlwaysTileBelowCount = 24;
constexpr float kDenseGroupMaxFaceArea = 0.0009f;
constexpr float kMinFacePixelSize = 12.0f;
constexpr float kMinFaceAreaFraction = 0.00028f;
constexpr float kFrontalAspectMin = 0.55f;
constexpr float kFrontalAspectMax = 1.8f;
constexpr float kProfileAspectMin = 0.35f;
constexpr float kProfileAspectMax = 1.8f;

constexpr float kMinKeepFaceArea = 0.0004f;
constexpr float kMinSoftFaceArea = 0.012f;
constexpr float kRelativeTinyFaceArea = 0.00075f;
constexpr float kRelativeTinyFaceMaxRatio = 0.50f;
constexpr float kRelativeTinyDeferMediaRatio = 8.0f;
constexpr float kDisplayedMediaMinArea = 0.0035f;
constexpr float kDisplayedMediaMaxArea = 0.16f;
constexpr float kDisplayedMediaBillboardMinArea = 0.012f;
constexpr float kDisplayedMediaMinPersonArea = 0.0004f;
constexpr float kDisplayedMediaSideSimilarMaxFaces = 6;
constexpr float kDisplayedMediaMaxSharpness = 48.0f;
constexpr float kFocusGoodThreshold = 65.0f;
constexpr float kFocusSoftThreshold = 40.0f;
constexpr float kEyeOpenConfidenceThreshold = 70.0f;
constexpr float kEyeClosedConfidenceThreshold = 88.0f;

// Brightness is hard-coded on macOS; keep the same contract for TS.
constexpr float kMacOsBrightnessPlaceholder = 60.0f;
// MSVC does not define M_PI unless _USE_MATH_DEFINES is set before <cmath>.
constexpr float kPi = 3.14159265358979323846f;

struct NormalizedFaceBox {
  float left{0.0f};
  float top{0.0f};
  float width{0.0f};
  float height{0.0f};
};

struct LandmarkNorm {
  float x{0.0f};
  float y{0.0f};
  bool valid{false};
};

float Clamp(float value, float minimum, float maximum) {
  return std::max(minimum, std::min(maximum, value));
}

float FaceArea(const FaceResult &face) {
  return std::max(0.0f, face.width) * std::max(0.0f, face.height);
}

float FaceCenterX(const FaceResult &face) {
  return face.left + face.width * 0.5f;
}

float FaceCenterY(const FaceResult &face) {
  return face.top + face.height * 0.5f;
}

float AbsYawRadians(float yaw) {
  float value = std::abs(yaw);
  if (value > kPi + 0.01f) {
    return (value * kPi) / 180.0f;
  }
  return value;
}

LandmarkNorm ToFaceLocal(
    float pixelX,
    float pixelY,
    float boxX1,
    float boxY1,
    float boxW,
    float boxH) {
  LandmarkNorm point;
  if (boxW < 1.0f || boxH < 1.0f) {
    return point;
  }
  point.x = (pixelX - boxX1) / boxW;
  point.y = (pixelY - boxY1) / boxH;
  point.valid = point.x >= -0.15f && point.x <= 1.15f && point.y >= -0.15f &&
                point.y <= 1.15f;
  return point;
}

bool PassesBaseFaceBoxChecks(
    const ScrfdDetection &detection,
    int imageWidth,
    int imageHeight,
    float acceptScoreThreshold) {
  if (detection.score < acceptScoreThreshold) {
    return false;
  }

  const float w = detection.x2 - detection.x1;
  const float h = detection.y2 - detection.y1;
  if (w < kMinFacePixelSize || h < kMinFacePixelSize) {
    return false;
  }

  const float areaFraction =
      (w * h) / (static_cast<float>(imageWidth) * static_cast<float>(imageHeight));
  return areaFraction >= kMinFaceAreaFraction;
}

bool HasRequiredFivePointLandmarks(const ScrfdDetection &detection) {
  const float boxW = detection.x2 - detection.x1;
  const float boxH = detection.y2 - detection.y1;
  if (boxW < 1.0f || boxH < 1.0f) {
    return false;
  }

  const auto leftEye =
      ToFaceLocal(detection.leftEye.x, detection.leftEye.y, detection.x1, detection.y1, boxW, boxH);
  const auto rightEye = ToFaceLocal(
      detection.rightEye.x, detection.rightEye.y, detection.x1, detection.y1, boxW, boxH);
  const auto nose =
      ToFaceLocal(detection.nose.x, detection.nose.y, detection.x1, detection.y1, boxW, boxH);
  const auto leftMouth = ToFaceLocal(
      detection.leftMouth.x, detection.leftMouth.y, detection.x1, detection.y1, boxW, boxH);
  const auto rightMouth = ToFaceLocal(
      detection.rightMouth.x, detection.rightMouth.y, detection.x1, detection.y1, boxW, boxH);

  if (!nose.valid) {
    return false;
  }
  if (!leftEye.valid && !rightEye.valid) {
    return false;
  }
  if (leftMouth.valid || rightMouth.valid) {
    return true;
  }
  return leftEye.valid && rightEye.valid;
}

// 5-keypoint adaptation of macOS hasPlausibleLandmarkLayout (no contour/eyebrow mesh).
bool HasPlausibleFrontalLayout(const ScrfdDetection &detection) {
  const float boxW = detection.x2 - detection.x1;
  const float boxH = detection.y2 - detection.y1;
  auto leftEye =
      ToFaceLocal(detection.leftEye.x, detection.leftEye.y, detection.x1, detection.y1, boxW, boxH);
  auto rightEye = ToFaceLocal(
      detection.rightEye.x, detection.rightEye.y, detection.x1, detection.y1, boxW, boxH);
  const auto nose =
      ToFaceLocal(detection.nose.x, detection.nose.y, detection.x1, detection.y1, boxW, boxH);
  const auto leftMouth = ToFaceLocal(
      detection.leftMouth.x, detection.leftMouth.y, detection.x1, detection.y1, boxW, boxH);
  const auto rightMouth = ToFaceLocal(
      detection.rightMouth.x, detection.rightMouth.y, detection.x1, detection.y1, boxW, boxH);

  if (!leftEye.valid || !rightEye.valid || !nose.valid) {
    return false;
  }

  if (leftEye.x > rightEye.x) {
    std::swap(leftEye, rightEye);
  }

  const float eyeDistance = rightEye.x - leftEye.x;
  if (eyeDistance < 0.15f || eyeDistance > 0.65f) {
    return false;
  }
  if (std::abs(leftEye.y - rightEye.y) > 0.12f) {
    return false;
  }

  const float eyeCenterX = (leftEye.x + rightEye.x) * 0.5f;
  if (std::abs(nose.x - eyeCenterX) > eyeDistance * 0.45f) {
    return false;
  }

  // Image coordinates: y increases downward. Normal face = eyes above nose above mouth.
  const float eyesY = (leftEye.y + rightEye.y) * 0.5f;
  const bool hasMouth = leftMouth.valid || rightMouth.valid;
  float mouthY = 0.0f;
  if (hasMouth) {
    if (leftMouth.valid && rightMouth.valid) {
      mouthY = (leftMouth.y + rightMouth.y) * 0.5f;
    } else {
      mouthY = leftMouth.valid ? leftMouth.y : rightMouth.y;
    }
  }

  if (hasMouth) {
    const bool normalOrder = eyesY + 0.02f <= nose.y && nose.y + 0.02f <= mouthY;
    if (!normalOrder) {
      return false;
    }
  } else if (eyesY + 0.10f > nose.y) {
    return false;
  }

  // Eyes in the upper portion of the box; mouth in the lower portion.
  if (eyesY > 0.64f) {
    return false;
  }
  if (hasMouth && mouthY < 0.32f) {
    return false;
  }

  const float eyeToNose = std::abs(eyesY - nose.y);
  if (eyeToNose < 0.08f || eyeToNose > 0.50f) {
    return false;
  }
  if (hasMouth) {
    const float noseToMouth = std::abs(nose.y - mouthY);
    if (noseToMouth < 0.05f || noseToMouth > 0.40f) {
      return false;
    }
    const float eyeToMouth = std::abs(eyesY - mouthY);
    if (eyeToMouth < eyeDistance * 0.55f || eyeToMouth > eyeDistance * 2.20f) {
      return false;
    }
  }

  return true;
}

bool HasPlausibleProfileLayout(const ScrfdDetection &detection) {
  if (!HasRequiredFivePointLandmarks(detection)) {
    return false;
  }

  const float boxW = detection.x2 - detection.x1;
  const float boxH = detection.y2 - detection.y1;
  const auto leftEye =
      ToFaceLocal(detection.leftEye.x, detection.leftEye.y, detection.x1, detection.y1, boxW, boxH);
  const auto rightEye = ToFaceLocal(
      detection.rightEye.x, detection.rightEye.y, detection.x1, detection.y1, boxW, boxH);
  const auto nose =
      ToFaceLocal(detection.nose.x, detection.nose.y, detection.x1, detection.y1, boxW, boxH);
  const auto leftMouth = ToFaceLocal(
      detection.leftMouth.x, detection.leftMouth.y, detection.x1, detection.y1, boxW, boxH);
  const auto rightMouth = ToFaceLocal(
      detection.rightMouth.x, detection.rightMouth.y, detection.x1, detection.y1, boxW, boxH);

  if (!nose.valid) {
    return false;
  }
  if (!leftMouth.valid && !rightMouth.valid) {
    return false;
  }

  float eyesY = 0.0f;
  if (leftEye.valid && rightEye.valid) {
    eyesY = (leftEye.y + rightEye.y) * 0.5f;
  } else if (leftEye.valid) {
    eyesY = leftEye.y;
  } else if (rightEye.valid) {
    eyesY = rightEye.y;
  } else {
    return false;
  }

  const float mouthY = leftMouth.valid && rightMouth.valid
                           ? (leftMouth.y + rightMouth.y) * 0.5f
                           : (leftMouth.valid ? leftMouth.y : rightMouth.y);

  // Prefer eyes → nose → mouth in image coords (y down).
  if (!(eyesY + 0.10f <= nose.y && nose.y + 0.10f <= mouthY)) {
    return false;
  }

  const float eyeToMouth = std::abs(eyesY - mouthY);
  return eyeToMouth >= 0.12f && eyeToMouth <= 0.70f;
}

bool IsAcceptableFrontalFace(
    const ScrfdDetection &detection,
    int imageWidth,
    int imageHeight,
    float acceptScoreThreshold,
    bool requireLandmarkPlausibility) {
  if (!PassesBaseFaceBoxChecks(
          detection, imageWidth, imageHeight, acceptScoreThreshold)) {
    return false;
  }

  const float w = detection.x2 - detection.x1;
  const float h = detection.y2 - detection.y1;
  const float aspect = w / std::max(1.0f, h);
  if (aspect < kFrontalAspectMin || aspect > kFrontalAspectMax) {
    return false;
  }

  const auto leftEye = ToFaceLocal(
      detection.leftEye.x, detection.leftEye.y, detection.x1, detection.y1, w, h);
  const auto rightEye = ToFaceLocal(
      detection.rightEye.x, detection.rightEye.y, detection.x1, detection.y1, w, h);
  if (!leftEye.valid || !rightEye.valid) {
    return false;
  }
  if (!HasRequiredFivePointLandmarks(detection)) {
    return false;
  }
  // High-confidence SCRFD boxes: skip strict layout (edge panelists can fail
  // frontal geometry checks while still being real faces).
  if (requireLandmarkPlausibility && detection.score < 0.78f &&
      !HasPlausibleFrontalLayout(detection)) {
    return false;
  }

  // Mirror macOS captureQuality gate. SCRFD always has a score, so treat it as
  // quality and skip the "quality == nil → confidence ≥ 0.80" Vision fallback.
  const float qualityProxy = detection.score;
  if (qualityProxy < 0.12f) {
    return false;
  }
  return true;
}

bool IsAcceptableProfileFace(
    const ScrfdDetection &detection,
    int imageWidth,
    int imageHeight,
    float acceptScoreThreshold,
    bool requireLandmarkPlausibility) {
  if (!PassesBaseFaceBoxChecks(
          detection, imageWidth, imageHeight, acceptScoreThreshold)) {
    return false;
  }

  const float w = detection.x2 - detection.x1;
  const float h = detection.y2 - detection.y1;
  const float aspect = w / std::max(1.0f, h);
  if (aspect < kProfileAspectMin || aspect > kProfileAspectMax) {
    return false;
  }
  if (requireLandmarkPlausibility && detection.score < 0.78f &&
      !HasPlausibleProfileLayout(detection)) {
    return false;
  }
  const float qualityProxy = detection.score;
  if (qualityProxy < 0.10f) {
    return false;
  }
  return true;
}

bool IsAcceptableFace(
    const ScrfdDetection &detection,
    int imageWidth,
    int imageHeight,
    float acceptScoreThreshold,
    bool requireLandmarkPlausibility) {
  return IsAcceptableFrontalFace(
             detection,
             imageWidth,
             imageHeight,
             acceptScoreThreshold,
             requireLandmarkPlausibility) ||
         IsAcceptableProfileFace(
             detection,
             imageWidth,
             imageHeight,
             acceptScoreThreshold,
             requireLandmarkPlausibility);
}

float IntersectionArea(const NormalizedFaceBox &a, const NormalizedFaceBox &b) {
  const float intersectLeft = std::max(a.left, b.left);
  const float intersectTop = std::max(a.top, b.top);
  const float intersectRight = std::min(a.left + a.width, b.left + b.width);
  const float intersectBottom = std::min(a.top + a.height, b.top + b.height);
  const float intersectWidth = std::max(0.0f, intersectRight - intersectLeft);
  const float intersectHeight = std::max(0.0f, intersectBottom - intersectTop);
  return intersectWidth * intersectHeight;
}

float IntersectionOverUnion(const NormalizedFaceBox &a, const NormalizedFaceBox &b) {
  const float intersection = IntersectionArea(a, b);
  if (intersection <= 0.0f) {
    return 0.0f;
  }
  const float unionArea = a.width * a.height + b.width * b.height - intersection;
  if (unionArea <= 0.0f) {
    return 0.0f;
  }
  return intersection / unionArea;
}

bool FaceBoxesAreRedundant(const NormalizedFaceBox &a, const NormalizedFaceBox &b) {
  const float iou = IntersectionOverUnion(a, b);
  if (iou >= kFaceBoxIoUThreshold) {
    return true;
  }

  const float intersection = IntersectionArea(a, b);
  const float minArea = std::min(a.width * a.height, b.width * b.height);
  const float maxArea = std::max(a.width * a.height, b.width * b.height);
  const float areaRatio = maxArea / std::max(minArea, 1e-8f);
  if (minArea > 1e-8f &&
      areaRatio >= kFaceBoxProximityMinAreaRatio &&
      (intersection / minArea) >= kFaceBoxIoSThreshold) {
    return true;
  }

  if (areaRatio < kFaceBoxProximityMinAreaRatio) {
    return false;
  }

  const float aCenterX = a.left + a.width * 0.5f;
  const float aCenterY = a.top + a.height * 0.5f;
  const float bCenterX = b.left + b.width * 0.5f;
  const float bCenterY = b.top + b.height * 0.5f;
  const float centerDistance = std::hypot(aCenterX - bCenterX, aCenterY - bCenterY);
  const float minDiagonal =
      std::min(std::hypot(a.width, a.height), std::hypot(b.width, b.height));
  return iou >= kFaceBoxProximityIoUThreshold &&
         centerDistance < kFaceBoxProximityCenterFactor * minDiagonal;
}

NormalizedFaceBox ToNormalized(const ScrfdDetection &detection, int imageWidth, int imageHeight) {
  return NormalizedFaceBox{
      detection.x1 / static_cast<float>(imageWidth),
      detection.y1 / static_cast<float>(imageHeight),
      (detection.x2 - detection.x1) / static_cast<float>(imageWidth),
      (detection.y2 - detection.y1) / static_cast<float>(imageHeight),
  };
}

std::vector<ScrfdDetection> DeduplicateFaces(
    std::vector<ScrfdDetection> detections,
    int imageWidth,
    int imageHeight) {
  if (detections.size() <= 1) {
    return detections;
  }

  std::sort(
      detections.begin(),
      detections.end(),
      [](const ScrfdDetection &a, const ScrfdDetection &b) {
        if (a.score != b.score) {
          return a.score > b.score;
        }
        const float areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
        const float areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
        return areaA > areaB;
      });

  std::vector<ScrfdDetection> kept;
  for (const auto &candidate : detections) {
    const auto candidateNormalized = ToNormalized(candidate, imageWidth, imageHeight);
    const bool overlapsExisting =
        std::any_of(kept.begin(), kept.end(), [&](const ScrfdDetection &existing) {
          return FaceBoxesAreRedundant(
              candidateNormalized, ToNormalized(existing, imageWidth, imageHeight));
        });
    if (!overlapsExisting) {
      kept.push_back(candidate);
    }
  }
  return kept;
}

float MaxNormalizedFaceArea(const std::vector<ScrfdDetection> &detections, int imageWidth, int imageHeight) {
  float maxArea = 0.0f;
  for (const auto &detection : detections) {
    const auto box = ToNormalized(detection, imageWidth, imageHeight);
    maxArea = std::max(maxArea, box.width * box.height);
  }
  return maxArea;
}

bool ShouldSkipFurtherTiling(
    const std::vector<ScrfdDetection> &faces,
    int imageWidth,
    int imageHeight) {
  if (faces.empty()) {
    return false;
  }
  if (faces.size() >= kDenseGroupAlwaysTileBelowCount) {
    return true;
  }
  // Enough confident faces already → skip expensive 2x2/3x3 grids.
  if (faces.size() >= kMinFacesToSkipTiling) {
    return true;
  }
  const float maxArea = MaxNormalizedFaceArea(faces, imageWidth, imageHeight);
  // At least one reasonably-sized subject face: tiling rarely adds real faces.
  if (maxArea >= 0.0040f) {
    return true;
  }
  // Only keep tiling for sparse / micro-only frames.
  return maxArea > 0.0f && maxArea >= kDenseGroupMaxFaceArea && faces.size() >= 2;
}

ScrfdDetection OffsetDetection(const ScrfdDetection &detection, float offsetX, float offsetY) {
  ScrfdDetection mapped = detection;
  mapped.x1 += offsetX;
  mapped.y1 += offsetY;
  mapped.x2 += offsetX;
  mapped.y2 += offsetY;
  mapped.leftEye.x += offsetX;
  mapped.leftEye.y += offsetY;
  mapped.rightEye.x += offsetX;
  mapped.rightEye.y += offsetY;
  mapped.nose.x += offsetX;
  mapped.nose.y += offsetY;
  mapped.leftMouth.x += offsetX;
  mapped.leftMouth.y += offsetY;
  mapped.rightMouth.x += offsetX;
  mapped.rightMouth.y += offsetY;
  return mapped;
}

std::vector<uint8_t> CopyBgraTile(
    const uint8_t *bgra,
    int imageWidth,
    int imageHeight,
    int stride,
    int tileLeft,
    int tileTop,
    int tileWidth,
    int tileHeight) {
  std::vector<uint8_t> tile(static_cast<size_t>(tileWidth * tileHeight * 4));
  for (int y = 0; y < tileHeight; ++y) {
    const int sourceY = tileTop + y;
    if (sourceY < 0 || sourceY >= imageHeight) {
      continue;
    }
    for (int x = 0; x < tileWidth; ++x) {
      const int sourceX = tileLeft + x;
      if (sourceX < 0 || sourceX >= imageWidth) {
        continue;
      }
      const int sourceIndex = sourceY * stride + sourceX * 4;
      const int destIndex = (y * tileWidth + x) * 4;
      tile[static_cast<size_t>(destIndex + 0)] = bgra[sourceIndex + 0];
      tile[static_cast<size_t>(destIndex + 1)] = bgra[sourceIndex + 1];
      tile[static_cast<size_t>(destIndex + 2)] = bgra[sourceIndex + 2];
      tile[static_cast<size_t>(destIndex + 3)] = bgra[sourceIndex + 3];
    }
  }
  return tile;
}

std::vector<ScrfdDetection> DetectRectanglesTiled(
    const ScrfdFaceDetector &scrfd,
    const uint8_t *bgra,
    int imageWidth,
    int imageHeight,
    int stride,
    float scoreThreshold,
    float nmsThreshold,
    int gridCount) {
  if (imageWidth <= 0 || imageHeight <= 0 || gridCount <= 0) {
    return {};
  }

  const float tileWidthF =
      static_cast<float>(imageWidth) / static_cast<float>(gridCount) *
      (1.0f + kTileOverlapFraction);
  const float tileHeightF =
      static_cast<float>(imageHeight) / static_cast<float>(gridCount) *
      (1.0f + kTileOverlapFraction);
  const float stepX = static_cast<float>(imageWidth) / static_cast<float>(gridCount);
  const float stepY = static_cast<float>(imageHeight) / static_cast<float>(gridCount);

  std::vector<ScrfdDetection> merged;
  for (int row = 0; row < gridCount; ++row) {
    for (int col = 0; col < gridCount; ++col) {
      float originX = static_cast<float>(col) * stepX;
      float originY = static_cast<float>(row) * stepY;
      if (originX + tileWidthF > static_cast<float>(imageWidth)) {
        originX = std::max(0.0f, static_cast<float>(imageWidth) - tileWidthF);
      }
      if (originY + tileHeightF > static_cast<float>(imageHeight)) {
        originY = std::max(0.0f, static_cast<float>(imageHeight) - tileHeightF);
      }

      const int tileLeft = static_cast<int>(std::floor(originX));
      const int tileTop = static_cast<int>(std::floor(originY));
      const int tileWidth = std::max(
          1,
          std::min(imageWidth - tileLeft, static_cast<int>(std::ceil(tileWidthF))));
      const int tileHeight = std::max(
          1,
          std::min(imageHeight - tileTop, static_cast<int>(std::ceil(tileHeightF))));

      const auto tilePixels = CopyBgraTile(
          bgra, imageWidth, imageHeight, stride, tileLeft, tileTop, tileWidth, tileHeight);
      auto tileDetections = scrfd.detectBgra(
          tilePixels.data(),
          tileWidth,
          tileHeight,
          tileWidth * 4,
          scoreThreshold,
          nmsThreshold);
      for (auto &detection : tileDetections) {
        merged.push_back(OffsetDetection(
            detection, static_cast<float>(tileLeft), static_cast<float>(tileTop)));
      }
    }
  }

  return DeduplicateFaces(std::move(merged), imageWidth, imageHeight);
}

std::vector<ScrfdDetection> CollectFaceRectangles(
    const ScrfdFaceDetector &scrfd,
    const uint8_t *bgra,
    int imageWidth,
    int imageHeight,
    int stride,
    float scoreThreshold,
    float nmsThreshold,
    bool enableTiling) {
  auto fullFrame = scrfd.detectBgra(
      bgra, imageWidth, imageHeight, stride, scoreThreshold, nmsThreshold);
  fullFrame = DeduplicateFaces(std::move(fullFrame), imageWidth, imageHeight);

  const size_t pixelCount = static_cast<size_t>(imageWidth) * static_cast<size_t>(imageHeight);
  // Dense tiling is expensive (often 4x+ slower). Only escalate when the
  // full-frame pass looks under-detected — group shots already covered stay fast.
  if (!enableTiling || pixelCount < kMinPixelsForTiling ||
      ShouldSkipFurtherTiling(fullFrame, imageWidth, imageHeight)) {
    return fullFrame;
  }

  auto tiledTwoByTwo = DetectRectanglesTiled(
      scrfd, bgra, imageWidth, imageHeight, stride, scoreThreshold, nmsThreshold, 2);
  std::vector<ScrfdDetection> combined = fullFrame;
  combined.insert(combined.end(), tiledTwoByTwo.begin(), tiledTwoByTwo.end());
  auto deduped = DeduplicateFaces(std::move(combined), imageWidth, imageHeight);
  if (ShouldSkipFurtherTiling(deduped, imageWidth, imageHeight)) {
    return deduped;
  }

  auto tiledThreeByThree = DetectRectanglesTiled(
      scrfd, bgra, imageWidth, imageHeight, stride, scoreThreshold, nmsThreshold, 3);
  deduped.insert(deduped.end(), tiledThreeByThree.begin(), tiledThreeByThree.end());
  return DeduplicateFaces(std::move(deduped), imageWidth, imageHeight);
}

constexpr int kSharpnessNormWidth = 32;
constexpr int kSharpnessNormHeight = 32;

float SampleBgraLuma(
    const uint8_t *pixels,
    int width,
    int height,
    int stride,
    float x,
    float y) {
  x = Clamp(x, 0.0f, static_cast<float>(width - 1));
  y = Clamp(y, 0.0f, static_cast<float>(height - 1));
  const int x0 = static_cast<int>(std::floor(x));
  const int y0 = static_cast<int>(std::floor(y));
  const int x1 = std::min(width - 1, x0 + 1);
  const int y1 = std::min(height - 1, y0 + 1);
  const float tx = x - static_cast<float>(x0);
  const float ty = y - static_cast<float>(y0);

  const auto lumaAt = [&](int px, int py) {
    const int index = py * stride + px * 4;
    return static_cast<float>(
        pixels[index] * 0.114 + pixels[index + 1] * 0.587 +
        pixels[index + 2] * 0.299);
  };

  const float v00 = lumaAt(x0, y0);
  const float v10 = lumaAt(x1, y0);
  const float v01 = lumaAt(x0, y1);
  const float v11 = lumaAt(x1, y1);
  const float v0 = v00 + (v10 - v00) * tx;
  const float v1 = v01 + (v11 - v01) * tx;
  return v0 + (v1 - v0) * ty;
}

float ComputeSharpness(
    const uint8_t *pixels,
    int width,
    int height,
    int stride,
    float boxX,
    float boxY,
    float boxW,
    float boxH) {
  const int left = std::max(0, static_cast<int>(std::lround(boxX)));
  const int top = std::max(0, static_cast<int>(std::lround(boxY)));
  const int right = std::min(width, left + std::max(1, static_cast<int>(std::lround(boxW))));
  const int bottom = std::min(height, top + std::max(1, static_cast<int>(std::lround(boxH))));
  const int roiW = right - left;
  const int roiH = bottom - top;
  if (roiW < 3 || roiH < 3) {
    return 30.0f;
  }

  auto laplacianVariance = [](const float *gray, int gw, int gh) {
    double sum = 0.0;
    double sumSquared = 0.0;
    int count = 0;
    for (int y = 1; y < gh - 1; ++y) {
      for (int x = 1; x < gw - 1; ++x) {
        const float center = gray[y * gw + x];
        const double laplacian = -gray[(y - 1) * gw + x] - gray[y * gw + (x - 1)] +
                                 4.0 * center - gray[y * gw + (x + 1)] -
                                 gray[(y + 1) * gw + x];
        sum += laplacian;
        sumSquared += laplacian * laplacian;
        ++count;
      }
    }
    if (count == 0) {
      return 30.0f;
    }
    const double mean = sum / count;
    const double variance = (sumSquared / count) - mean * mean;
    const float normalized =
        static_cast<float>(std::log(variance + 1.0) / std::log(50000.0) * 100.0);
    return Clamp(normalized, 0.0f, 100.0f);
  };

  if (roiW >= kSharpnessNormWidth || roiH >= kSharpnessNormHeight) {
    float norm[kSharpnessNormWidth * kSharpnessNormHeight];
    const float srcW = static_cast<float>(std::max(1, roiW - 1));
    const float srcH = static_cast<float>(std::max(1, roiH - 1));
    for (int y = 0; y < kSharpnessNormHeight; ++y) {
      const float srcY =
          static_cast<float>(top) +
          (static_cast<float>(y) + 0.5f) * srcH /
              static_cast<float>(kSharpnessNormHeight) -
          0.5f;
      for (int x = 0; x < kSharpnessNormWidth; ++x) {
        const float srcX =
            static_cast<float>(left) +
            (static_cast<float>(x) + 0.5f) * srcW /
                static_cast<float>(kSharpnessNormWidth) -
            0.5f;
        norm[y * kSharpnessNormWidth + x] =
            SampleBgraLuma(pixels, width, height, stride, srcX, srcY);
      }
    }
    return laplacianVariance(norm, kSharpnessNormWidth, kSharpnessNormHeight);
  }

  std::vector<float> gray(static_cast<size_t>(roiW * roiH));
  for (int y = 0; y < roiH; ++y) {
    for (int x = 0; x < roiW; ++x) {
      gray[static_cast<size_t>(y * roiW + x)] = SampleBgraLuma(
          pixels,
          width,
          height,
          stride,
          static_cast<float>(left + x),
          static_cast<float>(top + y));
    }
  }
  float score = laplacianVariance(gray.data(), roiW, roiH);
  const int roiPixels = roiW * roiH;
  if (roiPixels < 20 * 14) {
    constexpr float kSoftPrior = 48.0f;
    constexpr float kTrust = 0.40f;
    score = kSoftPrior + (score - kSoftPrior) * kTrust;
  }
  return score;
}

float SharpnessFromDetection(
    const uint8_t *pixels,
    int width,
    int height,
    int stride,
    const ScrfdDetection &detection) {
  const float boxW = detection.x2 - detection.x1;
  const float boxH = detection.y2 - detection.y1;
  if (boxW < 3.0f || boxH < 3.0f) {
    return 30.0f;
  }

  constexpr float inset = 0.24f;
  return ComputeSharpness(
      pixels,
      width,
      height,
      stride,
      detection.x1 + boxW * inset,
      detection.y1 + boxH * inset,
      boxW * (1.0f - inset * 2.0f),
      boxH * (1.0f - inset * 2.0f));
}

// Match Apple Vision VNFaceObservation.yaw (radians). TS media filters
// (rejectLikelyDisplayedMediaFaces) and AbsYawRadians assume radians; emitting
// degrees caused side-of-frame group faces with mild pose (~0.5–3°) to be
// misread as ~0.5–3 rad profiles and dropped (TR5_1353: 28 → 12).
float EstimateYawRadians(float leftEyeX, float rightEyeX, float noseX) {
  const float eyeMidX = (leftEyeX + rightEyeX) * 0.5f;
  const float eyeDist = std::max(1.0f, std::abs(rightEyeX - leftEyeX));
  const float degrees = Clamp(((noseX - eyeMidX) / eyeDist) * 35.0f, -45.0f, 45.0f);
  return degrees * kPi / 180.0f;
}

// Approximate pitch (radians) from eye/nose/mouth vertical layout for looking-down demotion.
float EstimatePitchRadians(const ScrfdDetection &detection) {
  const float boxH = std::max(1.0f, detection.y2 - detection.y1);
  const float eyesY = (detection.leftEye.y + detection.rightEye.y) * 0.5f;
  const float mouthY = (detection.leftMouth.y + detection.rightMouth.y) * 0.5f;
  const float relativeEyes = (eyesY - detection.y1) / boxH;
  // Eyes low in the box (image y-down) ≈ Vision face-landmark eyesY in [0.36, 0.52].
  if (relativeEyes > 0.42f && relativeEyes < 0.68f) {
    return -0.18f;
  }
  if (mouthY <= eyesY) {
    return -0.20f;
  }
  return 0.0f;
}

EyesOpenResult ApplyLookingDownEyeHeuristic(
    EyesOpenResult eyes,
    float pitchRadians,
    float faceArea) {
  // Kept for call-site compatibility; open/closed decisions live in OCEC + TS.
  (void)faceArea;
  (void)pitchRadians;
  return eyes;
}

float UpperHalfMeanFaceArea(const std::vector<FaceResult> &faces) {
  std::vector<float> areas;
  areas.reserve(faces.size());
  for (const auto &face : faces) {
    const float area = FaceArea(face);
    if (area > 0.0f) {
      areas.push_back(area);
    }
  }
  if (areas.empty()) {
    return 0.0f;
  }
  std::sort(areas.begin(), areas.end());
  const size_t start = areas.size() / 2;
  double sum = 0.0;
  size_t count = 0;
  for (size_t index = start; index < areas.size(); ++index) {
    sum += areas[index];
    ++count;
  }
  return count > 0 ? static_cast<float>(sum / static_cast<double>(count)) : 0.0f;
}

std::vector<FaceResult> RejectLikelyNonFaceArtifacts(
    std::vector<FaceResult> faces,
    bool enableTinyAreaArtifactFilter,
    bool enableSharpnessArtifactFilter) {
  if (faces.empty()) {
    return faces;
  }

  const float referenceArea = UpperHalfMeanFaceArea(faces);
  std::vector<FaceResult> kept;
  kept.reserve(faces.size());

  for (const auto &face : faces) {
    const float area = FaceArea(face);
    if (area < kMinKeepFaceArea) {
      continue;
    }

    if (enableTinyAreaArtifactFilter && faces.size() >= 2 && referenceArea > 0.0f &&
        area < kRelativeTinyFaceArea &&
        area < referenceArea * kRelativeTinyFaceMaxRatio) {
      const float sizeRatio = referenceArea / std::max(area, 1e-8f);
      bool deferToMediaFilter = false;
      if (sizeRatio >= kRelativeTinyDeferMediaRatio) {
        const float centerY = FaceCenterY(face);
        for (const auto &other : faces) {
          const float otherArea = FaceArea(other);
          if (otherArea < referenceArea * 0.85f) {
            continue;
          }
          if (FaceCenterY(other) + 0.03f < centerY) {
            deferToMediaFilter = true;
            break;
          }
        }
      }
      if (!deferToMediaFilter) {
        continue;
      }
    }

    if (enableSharpnessArtifactFilter) {
      const bool openConfident =
          face.eyesOpen.value &&
          face.eyesOpen.confidence >= kEyeOpenConfidenceThreshold;
      if (openConfident && face.sharpness < kFocusSoftThreshold) {
        continue;
      }
      if (faces.size() >= 2 && face.sharpness >= kFocusSoftThreshold &&
          face.sharpness < kFocusGoodThreshold && area < kMinSoftFaceArea) {
        if (!(referenceArea > 0.0f &&
              area >= referenceArea * kRelativeTinyFaceMaxRatio)) {
          continue;
        }
      }
    }
    kept.push_back(face);
  }
  return kept;
}

std::vector<FaceResult> RejectLikelyDisplayedMediaFaces(std::vector<FaceResult> faces) {
  if (faces.size() < 2) {
    return faces;
  }

  const size_t count = faces.size();
  std::vector<float> areas(count);
  std::vector<float> centerXs(count);
  std::vector<float> centerYs(count);
  std::vector<float> yaws(count);
  for (size_t index = 0; index < count; ++index) {
    areas[index] = FaceArea(faces[index]);
    centerXs[index] = FaceCenterX(faces[index]);
    centerYs[index] = FaceCenterY(faces[index]);
    yaws[index] = AbsYawRadians(faces[index].pose.yaw);
  }

  std::vector<bool> reject(count, false);
  for (size_t candidate = 0; candidate < count; ++candidate) {
    const float candidateArea = areas[candidate];
    const float candidateCenterY = centerYs[candidate];
    const float candidateCenterX = centerXs[candidate];
    const float candidateYaw = yaws[candidate];

    // Sharp SCRFD LED faces skip the softMedia gate (IMG_3835), but require
    // billboard-sized area so mid-size sharp foreground subjects (IMG_3822)
    // are not wiped when smaller midground people sit lower in the frame.
    bool oversizedAbove = false;
    if (candidateArea >= kDisplayedMediaMinArea &&
        candidateArea <= kDisplayedMediaMaxArea) {
      for (size_t other = 0; other < count; ++other) {
        if (other == candidate) {
          continue;
        }
        const float otherArea = areas[other];
        if (otherArea < kDisplayedMediaMinPersonArea || otherArea >= candidateArea) {
          continue;
        }
        if (centerYs[other] <= candidateCenterY + 0.04f) {
          continue;
        }
        if (candidateArea / std::max(otherArea, 1e-8f) >= 3.0f) {
          oversizedAbove = true;
          break;
        }
      }
    }
    const bool softMedia =
        faces[candidate].sharpness < kDisplayedMediaMaxSharpness;
    if (oversizedAbove &&
        (softMedia || candidateArea >= kDisplayedMediaBillboardMinArea)) {
      reject[candidate] = true;
      continue;
    }

    // Remaining heuristics stay sharpness-gated so sharp real subjects are kept.
    if (!softMedia) {
      continue;
    }

    const bool onSide = candidateCenterX <= 0.38f || candidateCenterX >= 0.62f;
    if (count <= kDisplayedMediaSideSimilarMaxFaces &&
        (candidateCenterX <= 0.32f || candidateCenterX >= 0.68f) &&
        candidateArea >= kDisplayedMediaMinArea &&
        candidateArea <= kDisplayedMediaMaxArea) {
      bool sidePanelNearPerson = false;
      for (size_t other = 0; other < count; ++other) {
        if (other == candidate) {
          continue;
        }
        const float otherArea = areas[other];
        if (otherArea < kDisplayedMediaMinArea * 0.5f) {
          continue;
        }
        const float areaRatio = candidateArea / std::max(otherArea, 1e-8f);
        if (areaRatio < 0.40f || areaRatio > 2.50f) {
          continue;
        }
        const float candidateEdge = std::abs(candidateCenterX - 0.5f);
        const float otherEdge = std::abs(centerXs[other] - 0.5f);
        if (candidateEdge < otherEdge + 0.20f) {
          continue;
        }
        if (candidateCenterY > centerYs[other] + 0.06f) {
          continue;
        }
        sidePanelNearPerson = true;
        break;
      }
      if (sidePanelNearPerson) {
        reject[candidate] = true;
        continue;
      }
    }

    if (candidateYaw >= 0.4f && onSide) {
      bool hasFrontalPerson = false;
      for (size_t other = 0; other < count; ++other) {
        if (other == candidate) {
          continue;
        }
        if (yaws[other] <= 0.35f && areas[other] >= kMinKeepFaceArea) {
          hasFrontalPerson = true;
          break;
        }
      }
      if (hasFrontalPerson) {
        reject[candidate] = true;
        continue;
      }
    }

    if (candidateArea >= 0.015f && onSide) {
      bool hasMoreCenteredSmaller = false;
      for (size_t other = 0; other < count; ++other) {
        if (other == candidate) {
          continue;
        }
        const float otherArea = areas[other];
        if (otherArea < kMinKeepFaceArea || otherArea >= candidateArea * 0.85f) {
          continue;
        }
        if (std::abs(centerXs[other] - 0.5f) < std::abs(candidateCenterX - 0.5f)) {
          hasMoreCenteredSmaller = true;
          break;
        }
      }
      if (hasMoreCenteredSmaller) {
        reject[candidate] = true;
      }
    }
  }

  std::vector<FaceResult> kept;
  kept.reserve(count);
  for (size_t index = 0; index < count; ++index) {
    if (!reject[index]) {
      kept.push_back(faces[index]);
    }
  }
  return kept;
}

std::vector<FaceResult> RejectLikelyBackdropBillboardFaces(std::vector<FaceResult> faces) {
  if (faces.size() <= 1) {
    return faces;
  }

  std::vector<size_t> stageIndexes;
  std::vector<size_t> billboardIndexes;
  for (size_t index = 0; index < faces.size(); ++index) {
    const float area = FaceArea(faces[index]);
    const float centerY = FaceCenterY(faces[index]);
    if (area >= kMinKeepFaceArea && centerY >= 0.45f && centerY <= 0.88f) {
      stageIndexes.push_back(index);
    }
    if (area >= 0.012f && centerY < 0.40f) {
      billboardIndexes.push_back(index);
    }
  }

  if (stageIndexes.empty() || billboardIndexes.empty()) {
    return faces;
  }

  std::vector<bool> isBillboard(faces.size(), false);
  for (size_t index : billboardIndexes) {
    isBillboard[index] = true;
  }

  std::vector<FaceResult> kept;
  kept.reserve(faces.size());
  for (size_t index = 0; index < faces.size(); ++index) {
    if (!isBillboard[index]) {
      kept.push_back(faces[index]);
    }
  }
  return kept.empty() ? faces : kept;
}

std::vector<FaceResult> ReindexFaces(std::vector<FaceResult> faces) {
  for (size_t index = 0; index < faces.size(); ++index) {
    faces[index].faceId = "local-face-" + std::to_string(index);
  }
  return faces;
}

// SCRFD-calibrated FP cleanup. Prefer dropping flowers / fabric / hands over
// chasing every Vision micro-face — those FPs poison Key Faces in the product UI.
std::vector<FaceResult> ApplyScrfdNativeFpFilter(std::vector<FaceResult> faces) {
  if (faces.size() <= 1) {
    return faces;
  }

  const float referenceArea = UpperHalfMeanFaceArea(faces);
  std::vector<FaceResult> kept;
  kept.reserve(faces.size());

  for (const auto &face : faces) {
    const float area = FaceArea(face);
    const float centerX = FaceCenterX(face);
    const float centerY = FaceCenterY(face);
    const float edgeMin =
        std::min(std::min(centerX, 1.0f - centerX), std::min(centerY, 1.0f - centerY));
    const float score = face.confidence;
    const float aspect =
        face.height > 1e-6f ? face.width / face.height : 0.0f;

    // Strong, reasonably large detections are keepers.
    if (score >= 0.55f && area >= 0.0025f) {
      kept.push_back(face);
      continue;
    }
    if (score >= 0.70f && area >= 0.0015f) {
      kept.push_back(face);
      continue;
    }
    // Small but high-score faces (distant subjects) — keep; IMG_3822 / TR5_1353.
    if (score >= 0.68f && area >= 0.00045f) {
      kept.push_back(face);
      continue;
    }

    // Tiny / soft-score boxes are almost always texture FPs.
    if (area < 0.0015f && score < 0.55f) {
      continue;
    }
    if (area < 0.00090f && score < 0.68f) {
      continue;
    }

    // Extreme aspect fragments (hair / elbows / chair backs / ties).
    if ((aspect < 0.48f || aspect > 1.75f) && score < 0.65f) {
      continue;
    }

    // Relative-tiny vs dominant faces (background blobs next to subjects).
    if (faces.size() >= 3 && referenceArea > 0.0f && area < referenceArea * 0.18f &&
        area < 0.0030f && score < 0.60f) {
      continue;
    }

    // Crowd scenes: drop weak extras that inflate Key Faces with junk.
    if (faces.size() >= 8 && area < 0.0018f && score < 0.58f) {
      continue;
    }

    // Edge-strip weak detections (posters / partial crops / noise).
    if (edgeMin < 0.06f && area < 0.0035f && score < 0.58f) {
      continue;
    }

    // Mid-size but mediocre score — typical flower / lapel / mic false hits.
    if (area < 0.0060f && score < 0.50f) {
      continue;
    }

    kept.push_back(face);
  }
  return kept.empty() ? faces : kept;
}

std::vector<FaceResult> PostProcessFaceResults(
    std::vector<FaceResult> faces,
    bool enableTinyAreaArtifactFilter,
    bool enableSharpnessArtifactFilter) {
  faces = RejectLikelyNonFaceArtifacts(
      std::move(faces),
      enableTinyAreaArtifactFilter,
      enableSharpnessArtifactFilter);
  faces = RejectLikelyDisplayedMediaFaces(std::move(faces));
  faces = RejectLikelyBackdropBillboardFaces(std::move(faces));
  return ReindexFaces(std::move(faces));
}

} // namespace

struct FaceDetectionPipeline::Impl {
  ScrfdFaceDetector scrfd;
  OcecEyeStateClassifier ocec;
  Landmark106EarClassifier landmark106;
  PipelineConfig config;
  bool ready{false};
  std::string lastError;
};

bool FaceDetectionPipeline::initialize(const PipelineConfig &config) {
  if (!impl_) {
    impl_ = std::make_shared<Impl>();
  }
  impl_->config = config;

  if (!impl_->scrfd.initialize(config.scrfdModelPath)) {
    impl_->ready = false;
    impl_->lastError = "SCRFD: " + impl_->scrfd.lastError();
    return false;
  }

  // OCEC is optional — pipeline still works without eye state.
  if (!config.ocecModelPath.empty()) {
    if (!impl_->ocec.initialize(config.ocecModelPath)) {
      impl_->lastError = "OCEC: " + impl_->ocec.lastError();
    }
  }

  if (!config.landmark106ModelPath.empty()) {
    if (!impl_->landmark106.initialize(config.landmark106ModelPath)) {
      if (!impl_->lastError.empty()) {
        impl_->lastError += "; ";
      }
      impl_->lastError += "Landmark106: " + impl_->landmark106.lastError();
    }
  }

  impl_->ready = impl_->scrfd.isReady();
  if (impl_->ready && impl_->lastError.empty()) {
    impl_->lastError.clear();
  }
  return impl_->ready;
}

bool FaceDetectionPipeline::isReady() const {
  return impl_ && impl_->ready;
}

std::string FaceDetectionPipeline::lastError() const {
  return impl_ ? impl_->lastError : "Pipeline not initialized";
}

std::vector<FaceResult> FaceDetectionPipeline::detectFaces(
    const uint8_t *bgraPixels,
    int imageWidth,
    int imageHeight,
    int stride) const {
  if (!impl_ || !impl_->ready || bgraPixels == nullptr || imageWidth <= 0 ||
      imageHeight <= 0) {
    return {};
  }

  // Flow mirrors macOS:
  // collect rectangles (+ tiling) → accept frontal/profile → dedupe →
  // analyze (eyes/sharpness/pose) → postProcess.
  auto detections = CollectFaceRectangles(
      impl_->scrfd,
      bgraPixels,
      imageWidth,
      imageHeight,
      stride,
      impl_->config.scoreThreshold,
      impl_->config.nmsThreshold,
      impl_->config.enableTiling);

  std::vector<ScrfdDetection> accepted;
  accepted.reserve(detections.size());
  for (const auto &detection : detections) {
    if (!IsAcceptableFace(
            detection,
            imageWidth,
            imageHeight,
            impl_->config.acceptScoreThreshold,
            impl_->config.requireLandmarkPlausibility)) {
      continue;
    }
    accepted.push_back(detection);
  }
  accepted = DeduplicateFaces(std::move(accepted), imageWidth, imageHeight);

  const bool ocecReady = impl_->ocec.isReady();
  const bool earReady = impl_->landmark106.isReady();
  std::vector<FaceResult> results;
  results.reserve(accepted.size());

  int index = 0;
  for (const auto &detection : accepted) {
    const float boxW = detection.x2 - detection.x1;
    const float boxH = detection.y2 - detection.y1;
    const float faceArea =
        (boxW * boxH) /
        (static_cast<float>(imageWidth) * static_cast<float>(imageHeight));

    EyeStateResult eyeState;
    std::string eyeEngine = "none";
    // Phase 2: EAR on medium+ faces; OCEC for tiny crops where mesh is weak.
    if (earReady && faceArea >= impl_->config.earMinFaceArea) {
      eyeState = impl_->landmark106.classifyBgraBox(
          bgraPixels,
          imageWidth,
          imageHeight,
          stride,
          detection.x1,
          detection.y1,
          detection.x2,
          detection.y2);
      if (eyeState.state != EyeState::Unknown) {
        eyeEngine = "ear106";
      }
    }
    if (eyeState.state == EyeState::Unknown && ocecReady) {
      eyeState = impl_->ocec.classifyBgra(
          bgraPixels,
          imageWidth,
          imageHeight,
          stride,
          {detection.leftEye.x, detection.leftEye.y},
          {detection.rightEye.x, detection.rightEye.y});
      if (eyeState.state != EyeState::Unknown) {
        eyeEngine = "ocec";
      }
    }

    FaceResult face;
    face.left = detection.x1 / static_cast<float>(imageWidth);
    face.top = detection.y1 / static_cast<float>(imageHeight);
    face.width = boxW / static_cast<float>(imageWidth);
    face.height = boxH / static_cast<float>(imageHeight);
    face.confidence = detection.score;
    face.sharpness =
        SharpnessFromDetection(bgraPixels, imageWidth, imageHeight, stride, detection);
    face.brightness = kMacOsBrightnessPlaceholder;

    EyesOpenResult eyesOpen;
    eyesOpen.value = eyeState.state == EyeState::Open;
    eyesOpen.confidence = eyeState.confidence;
    eyesOpen.leftProbability = eyeState.leftOpenProbability;
    eyesOpen.rightProbability = eyeState.rightOpenProbability;
    if (eyeState.state == EyeState::Closed) {
      eyesOpen.value = false;
      const float maxOpen =
          std::max(eyesOpen.leftProbability, eyesOpen.rightProbability);
      const float minOpen =
          std::min(eyesOpen.leftProbability, eyesOpen.rightProbability);
      const bool clearlyClosed = maxOpen <= 0.12f && minOpen <= 0.10f;
      if (faceArea < 0.00085f) {
        eyesOpen.value = true;
        eyesOpen.confidence = 72.0f;
      } else if (faceArea < 0.0018f && !clearlyClosed && maxOpen >= 0.20f) {
        eyesOpen.value = true;
        eyesOpen.confidence = 72.0f;
      }
    } else if (eyeState.state == EyeState::Unknown) {
      eyesOpen.value = true;
      eyesOpen.confidence = 70.0f;
    }

    if (eyeEngine != "ear106" && eyesOpen.value && faceArea >= 0.015f &&
        eyesOpen.confidence <= 76.0f) {
      const float maxOpen =
          std::max(eyesOpen.leftProbability, eyesOpen.rightProbability);
      const float minOpen =
          std::min(eyesOpen.leftProbability, eyesOpen.rightProbability);
      if (maxOpen <= 0.12f && minOpen <= 0.10f) {
        eyesOpen.value = false;
        eyesOpen.confidence = 95.0f;
      }
    }

    if (eyeEngine != "ear106" && eyesOpen.value && faceArea >= 0.0018f &&
        faceArea < 0.0040f && eyesOpen.confidence <= 76.0f) {
      const float maxOpen =
          std::max(eyesOpen.leftProbability, eyesOpen.rightProbability);
      const float minOpen =
          std::min(eyesOpen.leftProbability, eyesOpen.rightProbability);
      if (maxOpen > 0.12f && maxOpen <= 0.19f && minOpen <= 0.05f) {
        eyesOpen.value = false;
        eyesOpen.confidence = 90.0f;
      }
    }

    face.pose.yaw = EstimateYawRadians(
        detection.leftEye.x, detection.rightEye.x, detection.nose.x);
    face.pose.pitch = EstimatePitchRadians(detection);
    face.eyesOpen = eyesOpen;
    face.faceId = "local-face-" + std::to_string(index);
    face.engine = earReady ? "scrfd+ear106" : "scrfd";

    const float mouthX =
        (detection.leftMouth.x + detection.rightMouth.x) * 0.5f /
        static_cast<float>(imageWidth);
    const float mouthY =
        (detection.leftMouth.y + detection.rightMouth.y) * 0.5f /
        static_cast<float>(imageHeight);

    face.landmarks = {
        {"eyeLeft",
         detection.leftEye.x / static_cast<float>(imageWidth),
         detection.leftEye.y / static_cast<float>(imageHeight)},
        {"eyeRight",
         detection.rightEye.x / static_cast<float>(imageWidth),
         detection.rightEye.y / static_cast<float>(imageHeight)},
        {"nose",
         detection.nose.x / static_cast<float>(imageWidth),
         detection.nose.y / static_cast<float>(imageHeight)},
        {"mouth", mouthX, mouthY},
    };

    results.push_back(std::move(face));
    ++index;
  }

  {
    std::vector<size_t> closedIdx;
    for (size_t i = 0; i < results.size(); ++i) {
      const auto &face = results[i];
      const float area = face.width * face.height;
      if (!face.eyesOpen.value && area >= 0.0010f && area < 0.0025f) {
        closedIdx.push_back(i);
      }
    }
    if (closedIdx.size() >= 2) {
      size_t keep = closedIdx[0];
      auto closedStrength = [](const FaceResult &face) {
        const float maxOpen = std::max(
            face.eyesOpen.leftProbability, face.eyesOpen.rightProbability);
        return std::make_pair(maxOpen, -face.eyesOpen.confidence);
      };
      for (size_t i = 1; i < closedIdx.size(); ++i) {
        if (closedStrength(results[closedIdx[i]]) <
            closedStrength(results[keep])) {
          keep = closedIdx[i];
        }
      }
      for (size_t idx : closedIdx) {
        if (idx == keep) {
          continue;
        }
        results[idx].eyesOpen.value = true;
        results[idx].eyesOpen.confidence = 72.0f;
      }
    }
  }

  if (impl_->config.enableNativeFpFilter) {
    results = ApplyScrfdNativeFpFilter(std::move(results));
  }

  if (impl_->config.enablePostProcess) {
    results = PostProcessFaceResults(
        std::move(results),
        impl_->config.enableTinyAreaArtifactFilter,
        impl_->config.enableSharpnessArtifactFilter);
  } else {
    results = ReindexFaces(std::move(results));
  }

  ApplyProductEyeAndFocusLabels(results);
  return results;
}

} // namespace FaceDetection
