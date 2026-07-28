#pragma once

#include <cstdint>
#include <memory>
#include <mutex>
#include <string>

namespace FaceDetection {

struct EyePoint {
  float x{0.0f};
  float y{0.0f};
};

enum class EyeState {
  Unknown,
  Open,
  Closed,
};

struct EyeStateResult {
  EyeState state{EyeState::Unknown};
  float confidence{0.0f};
  float leftOpenProbability{0.5f};
  float rightOpenProbability{0.5f};
};

class OcecEyeStateClassifier {
public:
  bool initialize(const std::string &modelPath);
  bool isReady() const;
  std::string lastError() const;

  EyeStateResult classifyBgra(
      const uint8_t *bgra,
      int width,
      int height,
      int stride,
      EyePoint leftEye,
      EyePoint rightEye) const;

private:
  struct Impl;
  std::shared_ptr<Impl> impl_;
  mutable std::mutex mutex_;
  bool ready_{false};
  std::string lastError_;
};

} // namespace FaceDetection
