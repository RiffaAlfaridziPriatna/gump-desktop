#include "Landmark106EarClassifier.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <memory>
#include <vector>

#if __has_include(<onnxruntime_cxx_api.h>)
#include <onnxruntime_cxx_api.h>
#define FACE_DETECTION_HAS_ONNXRUNTIME 1
#else
#define FACE_DETECTION_HAS_ONNXRUNTIME 0
#endif

namespace FaceDetection {
namespace {

constexpr int kInputSize = 192;
constexpr int kLeftEye[10] = {33, 34, 35, 36, 37, 38, 39, 40, 41, 42};
constexpr int kRightEye[10] = {87, 88, 89, 90, 91, 92, 93, 94, 95, 96};
constexpr float kOpenEar = 0.22f;
constexpr float kClosedEar = 0.16f;

float Clamp(float value, float minimum, float maximum) {
  return std::max(minimum, std::min(maximum, value));
}

#if FACE_DETECTION_HAS_ONNXRUNTIME

struct OrtState {
  Ort::Env env{ORT_LOGGING_LEVEL_WARNING, "GumpLandmark106"};
  Ort::SessionOptions sessionOptions;
  std::unique_ptr<Ort::Session> session;
  std::mutex mutex;
  std::string inputName{"data"};
  std::string outputName{"fc1"};
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

float ContourEar(const float *xy, const int *indices, int count) {
  float minX = 1e9f, maxX = -1e9f, minY = 1e9f, maxY = -1e9f, meanY = 0.0f;
  for (int i = 0; i < count; ++i) {
    const float x = xy[indices[i] * 2];
    const float y = xy[indices[i] * 2 + 1];
    minX = std::min(minX, x);
    maxX = std::max(maxX, x);
    minY = std::min(minY, y);
    maxY = std::max(maxY, y);
    meanY += y;
  }
  meanY /= static_cast<float>(count);
  float up = 0.0f, lo = 0.0f;
  int upN = 0, loN = 0;
  for (int i = 0; i < count; ++i) {
    const float y = xy[indices[i] * 2 + 1];
    if (y <= meanY) {
      up += y;
      ++upN;
    }
    if (y >= meanY) {
      lo += y;
      ++loN;
    }
  }
  const float width = std::max(1e-3f, maxX - minX);
  const float height = (upN > 0 && loN > 0)
                           ? std::abs((lo / static_cast<float>(loN)) -
                                      (up / static_cast<float>(upN)))
                           : std::max(1e-3f, maxY - minY);
  return height / width;
}

#endif

} // namespace

struct Landmark106EarClassifier::Impl {
#if FACE_DETECTION_HAS_ONNXRUNTIME
  OrtState ort;
#endif
};

bool Landmark106EarClassifier::initialize(const std::string &modelPath) {
  std::lock_guard<std::mutex> lock(mutex_);
  ready_ = false;
  lastError_.clear();
  if (!impl_) {
    impl_ = std::make_shared<Impl>();
  }

#if !FACE_DETECTION_HAS_ONNXRUNTIME
  lastError_ = "ONNX Runtime headers not available";
  return false;
#else
  try {
    impl_->ort.sessionOptions.SetIntraOpNumThreads(1);
    impl_->ort.sessionOptions.SetGraphOptimizationLevel(
        GraphOptimizationLevel::ORT_ENABLE_ALL);
#if defined(__APPLE__)
    impl_->ort.session = std::make_unique<Ort::Session>(
        impl_->ort.env, modelPath.c_str(), impl_->ort.sessionOptions);
#else
    const std::wstring wpath(modelPath.begin(), modelPath.end());
    impl_->ort.session = std::make_unique<Ort::Session>(
        impl_->ort.env, wpath.c_str(), impl_->ort.sessionOptions);
#endif
    Ort::AllocatorWithDefaultOptions allocator;
#if ORT_API_VERSION >= 13
    auto inName = impl_->ort.session->GetInputNameAllocated(0, allocator);
    impl_->ort.inputName = inName.get();
    auto outName = impl_->ort.session->GetOutputNameAllocated(0, allocator);
    impl_->ort.outputName = outName.get();
#else
    char *inRaw = impl_->ort.session->GetInputName(0, allocator);
    impl_->ort.inputName = inRaw ? inRaw : "data";
    if (inRaw) {
      allocator.Free(inRaw);
    }
    char *outRaw = impl_->ort.session->GetOutputName(0, allocator);
    impl_->ort.outputName = outRaw ? outRaw : "fc1";
    if (outRaw) {
      allocator.Free(outRaw);
    }
#endif
    ready_ = true;
    return true;
  } catch (const Ort::Exception &error) {
    lastError_ = error.what();
  } catch (const std::exception &error) {
    lastError_ = error.what();
  } catch (...) {
    lastError_ = "Unknown Landmark106 initialization error";
  }
  ready_ = false;
  return false;
#endif
}

bool Landmark106EarClassifier::isReady() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return ready_;
}

std::string Landmark106EarClassifier::lastError() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return lastError_;
}

EyeStateResult Landmark106EarClassifier::classifyBgraBox(
    const uint8_t *bgra,
    int width,
    int height,
    int stride,
    float x1,
    float y1,
    float x2,
    float y2) const {
  EyeStateResult result;
  if (!ready_ || !impl_ || bgra == nullptr || width <= 0 || height <= 0 ||
      stride < width * 4) {
    return result;
  }

  const float boxW = std::max(1.0f, x2 - x1);
  const float boxH = std::max(1.0f, y2 - y1);
  if (boxW < 8.0f || boxH < 8.0f) {
    return result;
  }

#if !FACE_DETECTION_HAS_ONNXRUNTIME
  return result;
#else
  try {
    const float cx = (x1 + x2) * 0.5f;
    const float cy = (y1 + y2) * 0.5f;
    const float scale =
        static_cast<float>(kInputSize) / (std::max(boxW, boxH) * 1.5f);
    const float m02 = static_cast<float>(kInputSize) * 0.5f - scale * cx;
    const float m12 = static_cast<float>(kInputSize) * 0.5f - scale * cy;

    std::vector<float> input(
        static_cast<size_t>(1 * 3 * kInputSize * kInputSize), 0.0f);
    for (int y = 0; y < kInputSize; ++y) {
      for (int x = 0; x < kInputSize; ++x) {
        const float srcX = (static_cast<float>(x) - m02) / scale;
        const float srcY = (static_cast<float>(y) - m12) / scale;
        const float r =
            SampleBgraChannel(bgra, width, height, stride, srcX, srcY, 2);
        const float g =
            SampleBgraChannel(bgra, width, height, stride, srcX, srcY, 1);
        const float b =
            SampleBgraChannel(bgra, width, height, stride, srcX, srcY, 0);
        const size_t pix = static_cast<size_t>(y * kInputSize + x);
        input[pix] = (r - 127.5f) / 128.0f;
        input[static_cast<size_t>(kInputSize * kInputSize) + pix] =
            (g - 127.5f) / 128.0f;
        input[static_cast<size_t>(2 * kInputSize * kInputSize) + pix] =
            (b - 127.5f) / 128.0f;
      }
    }

    std::lock_guard<std::mutex> ortLock(impl_->ort.mutex);
    if (!impl_->ort.session) {
      return result;
    }

    const std::array<int64_t, 4> shape{1, 3, kInputSize, kInputSize};
    Ort::MemoryInfo memoryInfo =
        Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
    Ort::Value tensor = Ort::Value::CreateTensor<float>(
        memoryInfo, input.data(), input.size(), shape.data(), shape.size());
    const char *inputNames[] = {impl_->ort.inputName.c_str()};
    const char *outputNames[] = {impl_->ort.outputName.c_str()};
    auto outputs = impl_->ort.session->Run(
        Ort::RunOptions{nullptr},
        inputNames,
        &tensor,
        1,
        outputNames,
        1);
    if (outputs.empty()) {
      return result;
    }

    const float *pred = outputs[0].GetTensorData<float>();
    const auto outShape = outputs[0].GetTensorTypeAndShapeInfo().GetShape();
    size_t count = 1;
    for (auto dim : outShape) {
      count *= static_cast<size_t>(std::max<int64_t>(1, dim));
    }
    if (count < 212) {
      return result;
    }

    std::array<float, 212> xy{};
    for (int i = 0; i < 106; ++i) {
      xy[static_cast<size_t>(i * 2)] =
          (pred[i * 2] + 1.0f) * static_cast<float>(kInputSize / 2);
      xy[static_cast<size_t>(i * 2 + 1)] =
          (pred[i * 2 + 1] + 1.0f) * static_cast<float>(kInputSize / 2);
    }

    const float leftEar = ContourEar(xy.data(), kLeftEye, 10);
    const float rightEar = ContourEar(xy.data(), kRightEye, 10);
    const float ear = 0.5f * (leftEar + rightEar);
    const float openProb = Clamp(
        (ear - kClosedEar) / std::max(1e-3f, kOpenEar - kClosedEar),
        0.0f,
        1.0f);
    result.leftOpenProbability = openProb;
    result.rightOpenProbability = openProb;

    if (ear >= kOpenEar) {
      result.state = EyeState::Open;
      result.confidence = Clamp(55.0f + openProb * 40.0f, 55.0f, 95.0f);
    } else if (ear <= kClosedEar) {
      result.state = EyeState::Closed;
      result.confidence = Clamp(55.0f + (1.0f - openProb) * 40.0f, 55.0f, 95.0f);
    } else {
      result.state = openProb >= 0.45f ? EyeState::Open : EyeState::Closed;
      result.confidence = 48.0f + std::abs(openProb - 0.5f) * 20.0f;
    }
    return result;
  } catch (...) {
    return result;
  }
#endif
}

} // namespace FaceDetection
