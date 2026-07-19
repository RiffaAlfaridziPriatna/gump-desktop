#pragma once

#include <filesystem>
#include <string>
#include <vector>

namespace GumpDesktop {

struct YuNetLandmark {
  float x{0.0f};
  float y{0.0f};
};

struct YuNetDetection {
  float left{0.0f};
  float top{0.0f};
  float width{0.0f};
  float height{0.0f};
  float score{0.0f};
  YuNetLandmark rightEye{};
  YuNetLandmark leftEye{};
  YuNetLandmark nose{};
  YuNetLandmark rightMouth{};
  YuNetLandmark leftMouth{};
};

class YuNetFaceDetector {
 public:
  static YuNetFaceDetector &Shared();

  bool EnsureReady();
  bool IsReady() const;
  std::string LastError() const;

  std::vector<YuNetDetection> DetectBgra(
      const uint8_t *bgra,
      int width,
      int height,
      int stride) const;

 private:
  YuNetFaceDetector() = default;

  bool Initialize();
  std::filesystem::path ResolveModelPath() const;

  bool ready_{false};
  bool initAttempted_{false};
  mutable std::string lastError_;
};

} // namespace GumpDesktop
