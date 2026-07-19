#pragma once

#include <cstdint>
#include <filesystem>
#include <mutex>
#include <string>

namespace GumpDesktop {

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
  static OcecEyeStateClassifier &Shared();

  bool EnsureReady();
  bool IsReady() const;
  std::string LastError() const;

  EyeStateResult ClassifyBgra(
      const uint8_t *bgra,
      int width,
      int height,
      int stride,
      EyePoint leftEye,
      EyePoint rightEye) const;

 private:
  OcecEyeStateClassifier() = default;

  bool Initialize();
  std::filesystem::path ResolveModelPath() const;

  mutable std::mutex initMutex_;
  bool ready_{false};
  bool initAttempted_{false};
  std::string lastError_;
};

} // namespace GumpDesktop
