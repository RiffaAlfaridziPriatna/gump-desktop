#include "pch.h"
#include "OcecEyeStateClassifier.h"

#include <Windows.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <memory>
#include <vector>

#if __has_include(<onnxruntime_cxx_api.h>)
#include <onnxruntime_cxx_api.h>
#define GUMP_HAS_ONNXRUNTIME 1
#else
#define GUMP_HAS_ONNXRUNTIME 0
#endif

namespace GumpDesktop {
namespace {

constexpr int kInputHeight = 24;
constexpr int kInputWidth = 40;
constexpr float kMinimumEyeDistance = 18.0f;
constexpr float kEyeCropWidthFromDistance = 0.55f;
constexpr float kOpenThreshold = 0.65f;
constexpr float kClosedThreshold = 0.20f;

float Clamp(float value, float minimum, float maximum) {
  return std::max(minimum, std::min(maximum, value));
}

#if GUMP_HAS_ONNXRUNTIME

struct EyeOrtState {
  Ort::Env env{ORT_LOGGING_LEVEL_WARNING, "GumpOcec"};
  Ort::SessionOptions sessionOptions;
  std::unique_ptr<Ort::Session> session;
  std::mutex mutex;
};

EyeOrtState &GetEyeOrtState() {
  static EyeOrtState state;
  return state;
}

std::filesystem::path ModuleDirectory() {
  wchar_t buffer[MAX_PATH]{};
  const DWORD length = GetModuleFileNameW(nullptr, buffer, MAX_PATH);
  if (length == 0 || length >= MAX_PATH) {
    return {};
  }
  return std::filesystem::path(buffer).parent_path();
}

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

OcecEyeStateClassifier &OcecEyeStateClassifier::Shared() {
  static OcecEyeStateClassifier classifier;
  return classifier;
}

bool OcecEyeStateClassifier::EnsureReady() {
  std::lock_guard<std::mutex> lock(initMutex_);
  if (ready_) {
    return true;
  }
  if (initAttempted_) {
    return false;
  }
  initAttempted_ = true;
  return Initialize();
}

bool OcecEyeStateClassifier::IsReady() const {
  std::lock_guard<std::mutex> lock(initMutex_);
  return ready_;
}

std::string OcecEyeStateClassifier::LastError() const {
  std::lock_guard<std::mutex> lock(initMutex_);
  return lastError_;
}

std::filesystem::path OcecEyeStateClassifier::ResolveModelPath() const {
#if GUMP_HAS_ONNXRUNTIME
  const auto moduleDir = ModuleDirectory();
  const std::filesystem::path candidates[] = {
      moduleDir / L"Assets" / L"Models" / L"eye_state_ocec_s.onnx",
      moduleDir / L"Models" / L"eye_state_ocec_s.onnx",
      std::filesystem::path(L"Assets") / L"Models" / L"eye_state_ocec_s.onnx",
      std::filesystem::path(L"Models") / L"eye_state_ocec_s.onnx",
  };
  for (const auto &candidate : candidates) {
    if (!candidate.empty() && std::filesystem::exists(candidate)) {
      return candidate;
    }
  }
#endif
  return {};
}

bool OcecEyeStateClassifier::Initialize() {
#if !GUMP_HAS_ONNXRUNTIME
  lastError_ = "ONNX Runtime headers were not available at build time";
  ready_ = false;
  return false;
#else
  try {
    const auto modelPath = ResolveModelPath();
    if (modelPath.empty()) {
      lastError_ = "OCEC eye-state model file not found next to the app executable";
      ready_ = false;
      return false;
    }

    auto &state = GetEyeOrtState();
    std::lock_guard<std::mutex> lock(state.mutex);
    state.sessionOptions.SetIntraOpNumThreads(1);
    state.sessionOptions.SetGraphOptimizationLevel(GraphOptimizationLevel::ORT_ENABLE_ALL);
    state.session = std::make_unique<Ort::Session>(
        state.env, modelPath.wstring().c_str(), state.sessionOptions);
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

EyeStateResult OcecEyeStateClassifier::ClassifyBgra(
    const uint8_t *bgra,
    int width,
    int height,
    int stride,
    EyePoint leftEye,
    EyePoint rightEye) const {
  EyeStateResult result;
  if (!ready_ || bgra == nullptr || width <= 0 || height <= 0 || stride < width * 4) {
    return result;
  }

#if !GUMP_HAS_ONNXRUNTIME
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

    auto &state = GetEyeOrtState();
    std::lock_guard<std::mutex> lock(state.mutex);
    if (!state.session) {
      return result;
    }

    const std::array<int64_t, 4> inputShape{2, 3, kInputHeight, kInputWidth};
    Ort::MemoryInfo memoryInfo =
        Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
    Ort::Value inputTensor = Ort::Value::CreateTensor<float>(
        memoryInfo, input.data(), input.size(), inputShape.data(), inputShape.size());
    static const char *inputNames[] = {"images"};
    static const char *outputNames[] = {"prob_open"};
    auto outputs = state.session->Run(
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

    if (minimumOpen >= kOpenThreshold) {
      result.state = EyeState::Open;
      result.confidence =
          85.0f + 14.0f * (minimumOpen - kOpenThreshold) / (1.0f - kOpenThreshold);
    } else if (minimumOpen <= kClosedThreshold) {
      result.state = EyeState::Closed;
      result.confidence =
          85.0f + 14.0f * (kClosedThreshold - minimumOpen) / kClosedThreshold;
    }
    result.confidence = Clamp(result.confidence, 0.0f, 99.0f);
    return result;
  } catch (...) {
    return result;
  }
#endif
}

} // namespace GumpDesktop
