#pragma once

#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

namespace FaceDetection {

struct ScrfdLandmark {
  float x{0.0f};
  float y{0.0f};
};

struct ScrfdDetection {
  float x1{0.0f};
  float y1{0.0f};
  float x2{0.0f};
  float y2{0.0f};
  float score{0.0f};
  ScrfdLandmark leftEye{};
  ScrfdLandmark rightEye{};
  ScrfdLandmark nose{};
  ScrfdLandmark rightMouth{};
  ScrfdLandmark leftMouth{};
};

class ScrfdFaceDetector {
public:
  bool initialize(const std::string &modelPath);
  bool isReady() const;
  std::string lastError() const;

  std::vector<ScrfdDetection> detectBgra(
      const uint8_t *bgra,
      int width,
      int height,
      int stride,
      float scoreThreshold = 0.5f,
      float nmsThreshold = 0.4f) const;

private:
  struct Impl;
  std::shared_ptr<Impl> impl_;
  mutable std::mutex mutex_;
  bool ready_{false};
  std::string lastError_;
  // Cached ONNX I/O names — supports InsightFace named exports and
  // anonymized numeric exports (SCRFD-10G bnkps from some converters).
  std::string inputName_;
  std::vector<std::string> outputNames_;
};

} // namespace FaceDetection
