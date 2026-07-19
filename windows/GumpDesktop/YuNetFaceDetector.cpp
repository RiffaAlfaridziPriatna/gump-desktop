#include "pch.h"
#include "YuNetFaceDetector.h"

#include <Windows.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <memory>
#include <mutex>

#if __has_include(<onnxruntime_cxx_api.h>)
#include <onnxruntime_cxx_api.h>
#define GUMP_HAS_ONNXRUNTIME 1
#else
#define GUMP_HAS_ONNXRUNTIME 0
#endif

namespace GumpDesktop {
namespace {

constexpr int kMaxLongEdge = 1280;
constexpr int kPadDivisor = 32;
constexpr float kScoreThreshold = 0.60f;
constexpr float kNmsThreshold = 0.30f;
constexpr int kTopK = 5000;
constexpr int kStrides[3] = {8, 16, 32};

struct Candidate {
  float left{0.0f};
  float top{0.0f};
  float width{0.0f};
  float height{0.0f};
  float score{0.0f};
  float landmarks[10]{};
};

float Clamp01(float value) {
  return std::max(0.0f, std::min(1.0f, value));
}

float IntersectionOverUnion(const Candidate &a, const Candidate &b) {
  const float left = std::max(a.left, b.left);
  const float top = std::max(a.top, b.top);
  const float right = std::min(a.left + a.width, b.left + b.width);
  const float bottom = std::min(a.top + a.height, b.top + b.height);
  const float width = std::max(0.0f, right - left);
  const float height = std::max(0.0f, bottom - top);
  const float intersection = width * height;
  if (intersection <= 0.0f) {
    return 0.0f;
  }
  const float unionArea = a.width * a.height + b.width * b.height - intersection;
  return unionArea > 0.0f ? intersection / unionArea : 0.0f;
}

std::vector<Candidate> ApplyNms(std::vector<Candidate> candidates) {
  std::sort(candidates.begin(), candidates.end(), [](const Candidate &a, const Candidate &b) {
    return a.score > b.score;
  });
  if (static_cast<int>(candidates.size()) > kTopK) {
    candidates.resize(static_cast<size_t>(kTopK));
  }

  std::vector<Candidate> kept;
  std::vector<bool> suppressed(candidates.size(), false);
  for (size_t i = 0; i < candidates.size(); ++i) {
    if (suppressed[i]) {
      continue;
    }
    kept.push_back(candidates[i]);
    for (size_t j = i + 1; j < candidates.size(); ++j) {
      if (!suppressed[j] &&
          IntersectionOverUnion(candidates[i], candidates[j]) >= kNmsThreshold) {
        suppressed[j] = true;
      }
    }
  }
  return kept;
}

int CeilDivisible(int value, int divisor) {
  return ((value - 1) / divisor + 1) * divisor;
}

#if GUMP_HAS_ONNXRUNTIME

struct OrtState {
  Ort::Env env{ORT_LOGGING_LEVEL_WARNING, "GumpYuNet"};
  Ort::SessionOptions sessionOptions;
  std::unique_ptr<Ort::Session> session;
  Ort::AllocatorWithDefaultOptions allocator;
  std::mutex mutex;
};

OrtState &GetOrtState() {
  static OrtState state;
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

#endif

} // namespace

YuNetFaceDetector &YuNetFaceDetector::Shared() {
  static YuNetFaceDetector detector;
  return detector;
}

bool YuNetFaceDetector::IsReady() const {
  return ready_;
}

std::string YuNetFaceDetector::LastError() const {
  return lastError_;
}

std::filesystem::path YuNetFaceDetector::ResolveModelPath() const {
#if GUMP_HAS_ONNXRUNTIME
  const auto moduleDir = ModuleDirectory();
  const std::filesystem::path candidates[] = {
      moduleDir / L"Assets" / L"Models" / L"face_detection_yunet_2023mar.onnx",
      moduleDir / L"Models" / L"face_detection_yunet_2023mar.onnx",
      std::filesystem::path(L"Assets") / L"Models" / L"face_detection_yunet_2023mar.onnx",
      std::filesystem::path(L"Models") / L"face_detection_yunet_2023mar.onnx",
  };
  for (const auto &candidate : candidates) {
    if (!candidate.empty() && std::filesystem::exists(candidate)) {
      return candidate;
    }
  }
#endif
  return {};
}

bool YuNetFaceDetector::EnsureReady() {
  if (ready_) {
    return true;
  }
  if (initAttempted_) {
    return false;
  }
  initAttempted_ = true;
  return Initialize();
}

bool YuNetFaceDetector::Initialize() {
#if !GUMP_HAS_ONNXRUNTIME
  lastError_ = "ONNX Runtime headers were not available at build time";
  ready_ = false;
  return false;
#else
  try {
    const auto modelPath = ResolveModelPath();
    if (modelPath.empty()) {
      lastError_ = "YuNet ONNX model file not found next to the app executable";
      ready_ = false;
      return false;
    }

    auto &state = GetOrtState();
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
    ready_ = false;
    return false;
  } catch (const std::exception &error) {
    lastError_ = error.what();
    ready_ = false;
    return false;
  } catch (...) {
    lastError_ = "Unknown ONNX Runtime initialization error";
    ready_ = false;
    return false;
  }
#endif
}

std::vector<YuNetDetection> YuNetFaceDetector::DetectBgra(
    const uint8_t *bgra,
    int width,
    int height,
    int stride) const {
  if (!ready_ || bgra == nullptr || width <= 0 || height <= 0 || stride < width * 4) {
    return {};
  }

#if !GUMP_HAS_ONNXRUNTIME
  return {};
#else
  try {
    const float scale = std::min(
        1.0f,
        static_cast<float>(kMaxLongEdge) /
            static_cast<float>(std::max(width, height)));
    const int scaledWidth = std::max(1, static_cast<int>(std::lround(width * scale)));
    const int scaledHeight = std::max(1, static_cast<int>(std::lround(height * scale)));
    const int padWidth = CeilDivisible(scaledWidth, kPadDivisor);
    const int padHeight = CeilDivisible(scaledHeight, kPadDivisor);

    std::vector<float> input(static_cast<size_t>(1 * 3 * padHeight * padWidth), 0.0f);
    auto writeChannel = [&](int channel, int x, int y, float value) {
      input[static_cast<size_t>(channel * padHeight * padWidth + y * padWidth + x)] = value;
    };

    for (int y = 0; y < scaledHeight; ++y) {
      const float sourceY = (y + 0.5f) / scale - 0.5f;
      const int y0 = std::clamp(static_cast<int>(std::floor(sourceY)), 0, height - 1);
      const int y1 = std::min(height - 1, y0 + 1);
      const float fy = sourceY - y0;
      for (int x = 0; x < scaledWidth; ++x) {
        const float sourceX = (x + 0.5f) / scale - 0.5f;
        const int x0 = std::clamp(static_cast<int>(std::floor(sourceX)), 0, width - 1);
        const int x1 = std::min(width - 1, x0 + 1);
        const float fx = sourceX - x0;

        const auto sample = [&](int sx, int sy, int channelOffset) {
          return static_cast<float>(bgra[sy * stride + sx * 4 + channelOffset]);
        };

        const float b =
            sample(x0, y0, 0) * (1 - fx) * (1 - fy) + sample(x1, y0, 0) * fx * (1 - fy) +
            sample(x0, y1, 0) * (1 - fx) * fy + sample(x1, y1, 0) * fx * fy;
        const float g =
            sample(x0, y0, 1) * (1 - fx) * (1 - fy) + sample(x1, y0, 1) * fx * (1 - fy) +
            sample(x0, y1, 1) * (1 - fx) * fy + sample(x1, y1, 1) * fx * fy;
        const float r =
            sample(x0, y0, 2) * (1 - fx) * (1 - fy) + sample(x1, y0, 2) * fx * (1 - fy) +
            sample(x0, y1, 2) * (1 - fx) * fy + sample(x1, y1, 2) * fx * fy;

        writeChannel(0, x, y, b);
        writeChannel(1, x, y, g);
        writeChannel(2, x, y, r);
      }
    }

    auto &state = GetOrtState();
    std::lock_guard<std::mutex> lock(state.mutex);
    if (!state.session) {
      return {};
    }

    const std::array<int64_t, 4> inputShape{
        1, 3, static_cast<int64_t>(padHeight), static_cast<int64_t>(padWidth)};
    Ort::MemoryInfo memoryInfo =
        Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
    Ort::Value inputTensor = Ort::Value::CreateTensor<float>(
        memoryInfo, input.data(), input.size(), inputShape.data(), inputShape.size());

    static const char *inputNames[] = {"input"};
    static const char *outputNames[] = {
        "cls_8",
        "cls_16",
        "cls_32",
        "obj_8",
        "obj_16",
        "obj_32",
        "bbox_8",
        "bbox_16",
        "bbox_32",
        "kps_8",
        "kps_16",
        "kps_32",
    };

    auto outputs = state.session->Run(
        Ort::RunOptions{nullptr},
        inputNames,
        &inputTensor,
        1,
        outputNames,
        12);

    std::vector<Candidate> candidates;
    for (size_t strideIndex = 0; strideIndex < 3; ++strideIndex) {
      const int stride = kStrides[strideIndex];
      const int cols = padWidth / stride;
      const int rows = padHeight / stride;
      const float *cls = outputs[strideIndex].GetTensorData<float>();
      const float *obj = outputs[strideIndex + 3].GetTensorData<float>();
      const float *bbox = outputs[strideIndex + 6].GetTensorData<float>();
      const float *kps = outputs[strideIndex + 9].GetTensorData<float>();

      for (int row = 0; row < rows; ++row) {
        for (int col = 0; col < cols; ++col) {
          const size_t idx = static_cast<size_t>(row * cols + col);
          const float clsScore = Clamp01(cls[idx]);
          const float objScore = Clamp01(obj[idx]);
          const float score = std::sqrt(clsScore * objScore);
          if (score < kScoreThreshold) {
            continue;
          }

          const float cx = (static_cast<float>(col) + bbox[idx * 4 + 0]) * stride;
          const float cy = (static_cast<float>(row) + bbox[idx * 4 + 1]) * stride;
          const float boxWidth = std::exp(bbox[idx * 4 + 2]) * stride;
          const float boxHeight = std::exp(bbox[idx * 4 + 3]) * stride;
          Candidate candidate;
          candidate.left = cx - boxWidth * 0.5f;
          candidate.top = cy - boxHeight * 0.5f;
          candidate.width = boxWidth;
          candidate.height = boxHeight;
          candidate.score = score;
          for (int n = 0; n < 5; ++n) {
            candidate.landmarks[2 * n] =
                (kps[idx * 10 + 2 * n] + static_cast<float>(col)) * stride;
            candidate.landmarks[2 * n + 1] =
                (kps[idx * 10 + 2 * n + 1] + static_cast<float>(row)) * stride;
          }
          candidates.push_back(candidate);
        }
      }
    }

    const auto kept = ApplyNms(std::move(candidates));
    std::vector<YuNetDetection> detections;
    detections.reserve(kept.size());
    const float invScale = scale > 0.0f ? 1.0f / scale : 1.0f;
    for (const auto &candidate : kept) {
      YuNetDetection detection;
      detection.left = candidate.left * invScale;
      detection.top = candidate.top * invScale;
      detection.width = candidate.width * invScale;
      detection.height = candidate.height * invScale;
      detection.score = candidate.score;
      detection.rightEye = {candidate.landmarks[0] * invScale, candidate.landmarks[1] * invScale};
      detection.leftEye = {candidate.landmarks[2] * invScale, candidate.landmarks[3] * invScale};
      detection.nose = {candidate.landmarks[4] * invScale, candidate.landmarks[5] * invScale};
      detection.rightMouth = {candidate.landmarks[6] * invScale, candidate.landmarks[7] * invScale};
      detection.leftMouth = {candidate.landmarks[8] * invScale, candidate.landmarks[9] * invScale};
      detections.push_back(detection);
    }
    return detections;
  } catch (...) {
    return {};
  }
#endif
}

} // namespace GumpDesktop
