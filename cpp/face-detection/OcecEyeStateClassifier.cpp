#include "OcecEyeStateClassifier.h"

#include "OrtSharedEnv.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <memory>
#include <vector>

namespace FaceDetection {
namespace {

constexpr int kInputHeight = 24;
constexpr int kInputWidth = 40;
constexpr float kMinimumEyeDistance = 12.0f;
constexpr float kEyeCropWidthFromDistance = 0.55f;
// Prefer open heavily — Vision baseline is open-heavy; OCEC false-closed is the
// dominant failure mode on matched faces.
constexpr float kOpenThreshold = 0.34f;
constexpr float kSoftOpenThreshold = 0.18f;
constexpr float kOpenAverageThreshold = 0.28f;
// Closed only on very strong bilateral evidence (false-closed dominates vs Vision).
constexpr float kClosedThreshold = 0.05f;
constexpr float kClosedMaxThreshold = 0.10f;
constexpr float kProfileSingleEyeOpen = 0.28f;

float Clamp(float value, float minimum, float maximum) {
  return std::max(minimum, std::min(maximum, value));
}

#if FACE_DETECTION_HAS_ONNXRUNTIME

struct EyeOrtState {
  Ort::SessionOptions sessionOptions;
  std::unique_ptr<Ort::Session> session;
  std::mutex mutex;
};

float SampleBgraChannel(
    const uint8_t *bgra,
    int width,
    int height,
    int stride,
    float sourceX,
    float sourceY,
    int channelOffset) {
  const float x = Clamp(sourceX, 0.0f, static_cast<float>(width - 1));
  const float y = Clamp(sourceY, 0.0f, static_cast<float>(height - 1));
  const int x0 = static_cast<int>(std::floor(x));
  const int y0 = static_cast<int>(std::floor(y));
  const int x1 = std::min(width - 1, x0 + 1);
  const int y1 = std::min(height - 1, y0 + 1);
  const float fx = x - static_cast<float>(x0);
  const float fy = y - static_cast<float>(y0);
  const auto sample = [&](int px, int py) {
    return static_cast<float>(bgra[py * stride + px * 4 + channelOffset]);
  };
  return sample(x0, y0) * (1.0f - fx) * (1.0f - fy) +
         sample(x1, y0) * fx * (1.0f - fy) +
         sample(x0, y1) * (1.0f - fx) * fy +
         sample(x1, y1) * fx * fy;
}

void WriteEyeCrop(
    std::vector<float> &input,
    int batchIndex,
    const uint8_t *bgra,
    int width,
    int height,
    int stride,
    EyePoint center,
    float cropWidth,
    float angle) {
  const float cropHeight = cropWidth * static_cast<float>(kInputHeight) /
                           static_cast<float>(kInputWidth);
  const float cosAngle = std::cos(angle);
  const float sinAngle = std::sin(angle);
  const size_t planeSize = static_cast<size_t>(kInputHeight * kInputWidth);
  const size_t batchOffset = static_cast<size_t>(batchIndex * 3) * planeSize;

  for (int y = 0; y < kInputHeight; ++y) {
    const float localY =
        ((static_cast<float>(y) + 0.5f) / kInputHeight - 0.5f) * cropHeight;
    for (int x = 0; x < kInputWidth; ++x) {
      const float localX =
          ((static_cast<float>(x) + 0.5f) / kInputWidth - 0.5f) * cropWidth;
      const float sourceX = center.x + cosAngle * localX - sinAngle * localY;
      const float sourceY = center.y + sinAngle * localX + cosAngle * localY;
      const size_t pixelOffset = static_cast<size_t>(y * kInputWidth + x);

      // OCEC's reference implementation converts the OpenCV BGR crop to RGB.
      input[batchOffset + pixelOffset] =
          SampleBgraChannel(bgra, width, height, stride, sourceX, sourceY, 2) / 255.0f;
      input[batchOffset + planeSize + pixelOffset] =
          SampleBgraChannel(bgra, width, height, stride, sourceX, sourceY, 1) / 255.0f;
      input[batchOffset + planeSize * 2 + pixelOffset] =
          SampleBgraChannel(bgra, width, height, stride, sourceX, sourceY, 0) / 255.0f;
    }
  }
}

#endif

} // namespace

struct OcecEyeStateClassifier::Impl {
#if FACE_DETECTION_HAS_ONNXRUNTIME
  EyeOrtState ort;
#endif
};

bool OcecEyeStateClassifier::initialize(const std::string &modelPath) {
  std::lock_guard<std::mutex> lock(mutex_);
#if !FACE_DETECTION_HAS_ONNXRUNTIME
  (void)modelPath;
  lastError_ = "ONNX Runtime headers were not available at build time";
  ready_ = false;
  return false;
#else
  try {
    if (modelPath.empty()) {
      lastError_ = "OCEC model path is empty";
      ready_ = false;
      return false;
    }

    if (!impl_) {
      impl_ = std::make_shared<Impl>();
    }

    std::lock_guard<std::mutex> ortLock(impl_->ort.mutex);
    impl_->ort.sessionOptions.SetIntraOpNumThreads(1);
    impl_->ort.sessionOptions.SetInterOpNumThreads(1);
    impl_->ort.sessionOptions.SetGraphOptimizationLevel(
        GraphOptimizationLevel::ORT_ENABLE_ALL);

#ifdef _WIN32
    const std::wstring wpath(modelPath.begin(), modelPath.end());
    impl_->ort.session = std::make_unique<Ort::Session>(
        SharedOrtEnv(), wpath.c_str(), impl_->ort.sessionOptions);
#else
    impl_->ort.session = std::make_unique<Ort::Session>(
        SharedOrtEnv(), modelPath.c_str(), impl_->ort.sessionOptions);
#endif

    ready_ = true;
    lastError_.clear();
    return true;
  } catch (const Ort::Exception &error) {
    lastError_ = error.what();
  } catch (const std::exception &error) {
    lastError_ = error.what();
  } catch (...) {
    lastError_ = "Unknown OCEC initialization error";
  }
  ready_ = false;
  return false;
#endif
}

bool OcecEyeStateClassifier::isReady() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return ready_;
}

std::string OcecEyeStateClassifier::lastError() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return lastError_;
}

EyeStateResult OcecEyeStateClassifier::classifyBgra(
    const uint8_t *bgra,
    int width,
    int height,
    int stride,
    EyePoint leftEye,
    EyePoint rightEye) const {
  EyeStateResult result;
  if (!ready_ || !impl_ || bgra == nullptr || width <= 0 || height <= 0 ||
      stride < width * 4) {
    return result;
  }

#if !FACE_DETECTION_HAS_ONNXRUNTIME
  return result;
#else
  if (leftEye.x > rightEye.x) {
    std::swap(leftEye, rightEye);
  }
  const float deltaX = rightEye.x - leftEye.x;
  const float deltaY = rightEye.y - leftEye.y;
  const float eyeDistance = std::sqrt(deltaX * deltaX + deltaY * deltaY);
  if (eyeDistance < kMinimumEyeDistance) {
    return result;
  }

  try {
    const float cropWidth = eyeDistance * kEyeCropWidthFromDistance;
    const float angle = std::atan2(deltaY, deltaX);
    std::vector<float> input(
        static_cast<size_t>(2 * 3 * kInputHeight * kInputWidth),
        0.0f);
    WriteEyeCrop(
        input, 0, bgra, width, height, stride, leftEye, cropWidth, angle);
    WriteEyeCrop(
        input, 1, bgra, width, height, stride, rightEye, cropWidth, angle);

    std::lock_guard<std::mutex> ortLock(impl_->ort.mutex);
    if (!impl_->ort.session) {
      return result;
    }

    const std::array<int64_t, 4> inputShape{2, 3, kInputHeight, kInputWidth};
    Ort::MemoryInfo memoryInfo =
        Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
    Ort::Value inputTensor = Ort::Value::CreateTensor<float>(
        memoryInfo, input.data(), input.size(), inputShape.data(), inputShape.size());
    static const char *inputNames[] = {"images"};
    static const char *outputNames[] = {"prob_open"};
    auto outputs = impl_->ort.session->Run(
        Ort::RunOptions{nullptr},
        inputNames,
        &inputTensor,
        1,
        outputNames,
        1);
    if (outputs.empty()) {
      return result;
    }

    const auto outputInfo = outputs[0].GetTensorTypeAndShapeInfo();
    if (outputInfo.GetElementCount() < 2) {
      return result;
    }
    const float *probabilities = outputs[0].GetTensorData<float>();
    result.leftOpenProbability = Clamp(probabilities[0], 0.0f, 1.0f);
    result.rightOpenProbability = Clamp(probabilities[1], 0.0f, 1.0f);
    const float minimumOpen =
        std::min(result.leftOpenProbability, result.rightOpenProbability);
    const float maximumOpen =
        std::max(result.leftOpenProbability, result.rightOpenProbability);
    const float averageOpen =
        (result.leftOpenProbability + result.rightOpenProbability) * 0.5f;

    // Closed only on strong evidence; otherwise open (Vision-floor / exceed mode).
    // Profile / one-eye-visible: a single open eye is enough to call open.
    if (maximumOpen <= kClosedThreshold && averageOpen <= kClosedThreshold &&
        minimumOpen <= kClosedThreshold) {
      result.state = EyeState::Closed;
      const float closedStrength =
          Clamp((kClosedMaxThreshold - maximumOpen) /
                    std::max(kClosedMaxThreshold, 1e-3f),
                0.0f,
                1.0f);
      result.confidence = 88.0f + 11.0f * closedStrength;
    } else if (
        minimumOpen >= kOpenThreshold || averageOpen >= kOpenAverageThreshold ||
        (maximumOpen >= kOpenThreshold && minimumOpen >= kSoftOpenThreshold) ||
        maximumOpen >= kProfileSingleEyeOpen || averageOpen >= 0.16f) {
      result.state = EyeState::Open;
      const float openStrength =
          Clamp((averageOpen - kSoftOpenThreshold) /
                    (1.0f - kSoftOpenThreshold),
                0.0f,
                1.0f);
      result.confidence = 86.0f + 12.0f * openStrength;
    } else {
      // Ambiguous → open with moderate conf (TS maps low conf to partial, not closed).
      result.state = EyeState::Open;
      result.confidence = 74.0f;
    }
    result.confidence = Clamp(result.confidence, 0.0f, 99.0f);
    return result;
  } catch (...) {
    return result;
  }
#endif
}

} // namespace FaceDetection
