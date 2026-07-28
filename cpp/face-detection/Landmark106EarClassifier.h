#pragma once

#include <cstdint>
#include <memory>
#include <mutex>
#include <string>

#include "OcecEyeStateClassifier.h"

namespace FaceDetection {

// InsightFace 2d106det → Eye Aspect Ratio open/closed (Vision-like geometry).
// Aligns with bbox-center crop (max-side * 1.5), then (pred+1)*(size/2).
class Landmark106EarClassifier {
public:
  bool initialize(const std::string &modelPath);
  bool isReady() const;
  std::string lastError() const;

  EyeStateResult classifyBgraBox(
      const uint8_t *bgra,
      int width,
      int height,
      int stride,
      float x1,
      float y1,
      float x2,
      float y2) const;

private:
  struct Impl;
  std::shared_ptr<Impl> impl_;
  mutable std::mutex mutex_;
  bool ready_{false};
  std::string lastError_;
};

} // namespace FaceDetection
