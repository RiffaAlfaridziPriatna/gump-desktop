#pragma once

#include <cstdint>
#include <memory>
#include <string>
#include <vector>

namespace FaceDetection {

struct FaceLandmark {
  std::string type;
  float x{0.0f};
  float y{0.0f};
};

struct FacePose {
  float pitch{0.0f};
  float roll{0.0f};
  float yaw{0.0f};
};

struct EyesOpenResult {
  bool value{false};
  float confidence{0.0f};
  float leftProbability{0.5f};
  float rightProbability{0.5f};
};

struct FaceResult {
  float left{0.0f};
  float top{0.0f};
  float width{0.0f};
  float height{0.0f};
  EyesOpenResult eyesOpen;
  std::string eyeStatus;
  std::string focusLevel;
  float sharpness{0.0f};
  float brightness{0.0f};
  float confidence{0.0f};
  std::vector<FaceLandmark> landmarks;
  FacePose pose;
  std::string faceId;
  std::string engine{"scrfd"};
};

struct PipelineConfig {
  std::string scrfdModelPath;
  std::string ocecModelPath;
  // Optional InsightFace 2d106det — EAR for medium+ faces; OCEC remains fallback.
  std::string landmark106ModelPath;
  // Prefer EAR when face area >= this fraction of the frame (else OCEC / open-bias).
  float earMinFaceArea{0.0018f};
  // Production defaults favor precision (flowers/ties/hands are common SCRFD FPs).
  // Harness can still pass --score 0.12 for Vision-floor recall experiments.
  float scoreThreshold{0.50f};
  float nmsThreshold{0.40f};
  float acceptScoreThreshold{0.65f};
  bool enableTiling{true};
  // 5-kps layout rejects texture FPs (flowers, fabric) that lack face geometry.
  bool requireLandmarkPlausibility{true};
  // Vision media/billboard postprocess over-rejects real SCRFD faces on stage shots.
  bool enablePostProcess{false};
  bool enableTinyAreaArtifactFilter{false};
  bool enableSharpnessArtifactFilter{false};
  bool enableNativeFpFilter{true};
  int pipelinePoolSize{0};
};

class FaceDetectionPipeline {
public:
  bool initialize(const PipelineConfig &config);
  bool isReady() const;
  std::string lastError() const;
  int workerCount() const;

  std::vector<FaceResult> detectFaces(
      const uint8_t *bgraPixels,
      int imageWidth,
      int imageHeight,
      int stride) const;

private:
  struct Impl;
  std::shared_ptr<Impl> impl_;
};

} // namespace FaceDetection
