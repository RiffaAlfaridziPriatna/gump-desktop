#include "ScrfdFaceDetector.h"

#include "OrtSharedEnv.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstring>
#include <memory>
#include <vector>

namespace FaceDetection {
namespace {

constexpr int kInputSize = 640;
constexpr int kNumAnchors = 2;
constexpr int kStrides[3] = {8, 16, 32};
constexpr int kTopK = 5000;
constexpr int kMaxNms = 30000;

struct ScaleParams {
  float ratio{1.0f};
  int dw{0};
  int dh{0};
};

struct Candidate {
  float x1{0.0f};
  float y1{0.0f};
  float x2{0.0f};
  float y2{0.0f};
  float score{0.0f};
  float landmarks[10]{};
};

float Clamp(float value, float minimum, float maximum) {
  return std::max(minimum, std::min(maximum, value));
}

float IntersectionOverUnion(const Candidate &a, const Candidate &b) {
  const float left = std::max(a.x1, b.x1);
  const float top = std::max(a.y1, b.y1);
  const float right = std::min(a.x2, b.x2);
  const float bottom = std::min(a.y2, b.y2);
  const float width = std::max(0.0f, right - left);
  const float height = std::max(0.0f, bottom - top);
  const float intersection = width * height;
  if (intersection <= 0.0f) {
    return 0.0f;
  }
  const float areaA = std::max(0.0f, a.x2 - a.x1) * std::max(0.0f, a.y2 - a.y1);
  const float areaB = std::max(0.0f, b.x2 - b.x1) * std::max(0.0f, b.y2 - b.y1);
  const float unionArea = areaA + areaB - intersection;
  return unionArea > 0.0f ? intersection / unionArea : 0.0f;
}

std::vector<Candidate> ApplyNms(
    std::vector<Candidate> candidates,
    float nmsThreshold) {
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
          IntersectionOverUnion(candidates[i], candidates[j]) >= nmsThreshold) {
        suppressed[j] = true;
      }
    }
  }
  return kept;
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

#if FACE_DETECTION_HAS_ONNXRUNTIME

struct OrtState {
  Ort::SessionOptions sessionOptions;
  std::unique_ptr<Ort::Session> session;
  std::mutex mutex;
};

#endif

} // namespace

struct ScrfdFaceDetector::Impl {
#if FACE_DETECTION_HAS_ONNXRUNTIME
  OrtState ort;
#endif
};

bool ScrfdFaceDetector::initialize(const std::string &modelPath) {
  std::lock_guard<std::mutex> lock(mutex_);
#if !FACE_DETECTION_HAS_ONNXRUNTIME
  (void)modelPath;
  lastError_ = "ONNX Runtime headers were not available at build time";
  ready_ = false;
  return false;
#else
  try {
    if (modelPath.empty()) {
      lastError_ = "SCRFD model path is empty";
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

    Ort::AllocatorWithDefaultOptions allocator;
    const size_t inputCount = impl_->ort.session->GetInputCount();
    if (inputCount < 1) {
      lastError_ = "SCRFD model has no inputs";
      ready_ = false;
      return false;
    }
#if ORT_API_VERSION >= 13
    auto inputNameAllocated =
        impl_->ort.session->GetInputNameAllocated(0, allocator);
    inputName_ = inputNameAllocated.get();
#else
    char *inputNameRaw = impl_->ort.session->GetInputName(0, allocator);
    inputName_ = inputNameRaw ? inputNameRaw : "input.1";
    if (inputNameRaw) {
      allocator.Free(inputNameRaw);
    }
#endif

    const size_t outputCount = impl_->ort.session->GetOutputCount();
    if (outputCount < 9) {
      lastError_ = "SCRFD model must expose 9 outputs (score/bbox/kps x3)";
      ready_ = false;
      return false;
    }

    struct OutputMeta {
      std::string name;
      std::vector<int64_t> shape;
      size_t points{0};
      size_t channels{0};
    };
    std::vector<OutputMeta> metas;
    metas.reserve(outputCount);
    for (size_t i = 0; i < outputCount; ++i) {
      OutputMeta meta;
#if ORT_API_VERSION >= 13
      auto nameAllocated =
          impl_->ort.session->GetOutputNameAllocated(i, allocator);
      meta.name = nameAllocated.get();
#else
      char *nameRaw = impl_->ort.session->GetOutputName(i, allocator);
      meta.name = nameRaw ? nameRaw : "";
      if (nameRaw) {
        allocator.Free(nameRaw);
      }
#endif
      auto info = impl_->ort.session->GetOutputTypeInfo(i).GetTensorTypeAndShapeInfo();
      meta.shape = info.GetShape();
      // Shapes: [1,N,C], [N,C], or [N] — recover N and C.
      // Some builds expose symbolic dims as -1; fall back to names / known C.
      auto positive = [](int64_t value) -> size_t {
        return value > 0 ? static_cast<size_t>(value) : 0;
      };
      if (meta.shape.size() == 3) {
        meta.points = positive(meta.shape[1]);
        meta.channels = positive(meta.shape[2]);
      } else if (meta.shape.size() == 2) {
        if (meta.shape[1] == 1 || meta.shape[1] == 4 || meta.shape[1] == 10) {
          meta.points = positive(meta.shape[0]);
          meta.channels = positive(meta.shape[1]);
        } else {
          meta.points = positive(meta.shape[1]);
          meta.channels = 1;
        }
      } else if (meta.shape.size() == 1) {
        meta.points = positive(meta.shape[0]);
        meta.channels = 1;
      }
      if (meta.channels == 0) {
        const auto &n = meta.name;
        if (n.find("score") != std::string::npos) {
          meta.channels = 1;
        } else if (n.find("bbox") != std::string::npos) {
          meta.channels = 4;
        } else if (n.find("kps") != std::string::npos) {
          meta.channels = 10;
        }
      }
      // Named InsightFace stride sizes when N is symbolic.
      if (meta.points == 0) {
        if (meta.name.find("_8") != std::string::npos &&
            meta.name.find("_16") == std::string::npos &&
            meta.name.find("_32") == std::string::npos) {
          meta.points = 12800;
        } else if (meta.name.find("_16") != std::string::npos) {
          meta.points = 3200;
        } else if (meta.name.find("_32") != std::string::npos) {
          meta.points = 800;
        }
      }
      metas.push_back(std::move(meta));
    }

    auto pickByChannels = [&](size_t channels) {
      std::vector<OutputMeta> matched;
      for (const auto &meta : metas) {
        if (meta.channels == channels) {
          matched.push_back(meta);
        }
      }
      std::sort(
          matched.begin(),
          matched.end(),
          [](const OutputMeta &a, const OutputMeta &b) {
            return a.points > b.points; // 12800, 3200, 800
          });
      return matched;
    };

    auto scores = pickByChannels(1);
    auto boxes = pickByChannels(4);
    auto kps = pickByChannels(10);

    // Prefer canonical InsightFace names when present (more reliable than shape).
    auto findNamed = [&](const char *name) -> std::string {
      for (const auto &meta : metas) {
        if (meta.name == name) {
          return meta.name;
        }
      }
      return {};
    };
    const char *canonical[] = {
        "score_8",
        "score_16",
        "score_32",
        "bbox_8",
        "bbox_16",
        "bbox_32",
        "kps_8",
        "kps_16",
        "kps_32",
    };
    bool haveCanonical = true;
    std::vector<std::string> namedOrder;
    for (const char *name : canonical) {
      auto found = findNamed(name);
      if (found.empty()) {
        haveCanonical = false;
        break;
      }
      namedOrder.push_back(found);
    }

    if (haveCanonical) {
      outputNames_ = std::move(namedOrder);
    } else if (scores.size() >= 3 && boxes.size() >= 3 && kps.size() >= 3) {
      outputNames_.clear();
      outputNames_.push_back(scores[0].name);
      outputNames_.push_back(scores[1].name);
      outputNames_.push_back(scores[2].name);
      outputNames_.push_back(boxes[0].name);
      outputNames_.push_back(boxes[1].name);
      outputNames_.push_back(boxes[2].name);
      outputNames_.push_back(kps[0].name);
      outputNames_.push_back(kps[1].name);
      outputNames_.push_back(kps[2].name);
    } else if (metas.size() >= 9) {
      // Some SCRFD-10G ONNX exports expose numeric output names with empty
      // TypeInfo shapes. InsightFace order is still score×3, bbox×3, kps×3.
      outputNames_.clear();
      for (size_t i = 0; i < 9; ++i) {
        outputNames_.push_back(metas[i].name);
      }
    } else {
      lastError_ = "SCRFD outputs could not be classified as score/bbox/kps";
      for (const auto &meta : metas) {
        lastError_ += " | " + meta.name + " pts=" + std::to_string(meta.points) +
                      " ch=" + std::to_string(meta.channels) + " shape=[";
        for (size_t si = 0; si < meta.shape.size(); ++si) {
          if (si) {
            lastError_ += ",";
          }
          lastError_ += std::to_string(meta.shape[si]);
        }
        lastError_ += "]";
      }
      ready_ = false;
      return false;
    }

    ready_ = true;
    lastError_.clear();
    return true;
  } catch (const Ort::Exception &error) {
    lastError_ = error.what();
  } catch (const std::exception &error) {
    lastError_ = error.what();
  } catch (...) {
    lastError_ = "Unknown SCRFD initialization error";
  }
  ready_ = false;
  return false;
#endif
}

bool ScrfdFaceDetector::isReady() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return ready_;
}

std::string ScrfdFaceDetector::lastError() const {
  std::lock_guard<std::mutex> lock(mutex_);
  return lastError_;
}

std::vector<ScrfdDetection> ScrfdFaceDetector::detectBgra(
    const uint8_t *bgra,
    int width,
    int height,
    int stride,
    float scoreThreshold,
    float nmsThreshold) const {
  if (!ready_ || !impl_ || bgra == nullptr || width <= 0 || height <= 0 ||
      stride < width * 4) {
    return {};
  }

#if !FACE_DETECTION_HAS_ONNXRUNTIME
  (void)scoreThreshold;
  (void)nmsThreshold;
  return {};
#else
  try {
    // Letterbox resize into 640x640 maintaining aspect ratio.
    const float ratio = std::min(
        static_cast<float>(kInputSize) / static_cast<float>(width),
        static_cast<float>(kInputSize) / static_cast<float>(height));
    const int newW = std::max(1, static_cast<int>(std::floor(width * ratio)));
    const int newH = std::max(1, static_cast<int>(std::floor(height * ratio)));
    const int padW = kInputSize - newW;
    const int padH = kInputSize - newH;
    const int dw = padW / 2;
    const int dh = padH / 2;
    ScaleParams scaleParams;
    scaleParams.ratio = ratio;
    scaleParams.dw = dw;
    scaleParams.dh = dh;

    std::vector<float> input(
        static_cast<size_t>(1 * 3 * kInputSize * kInputSize),
        0.0f);
    auto writeChannel = [&](int channel, int x, int y, float value) {
      input[static_cast<size_t>(channel * kInputSize * kInputSize + y * kInputSize + x)] =
          value;
    };

    for (int y = 0; y < newH; ++y) {
      const float sourceY =
          (static_cast<float>(y) + 0.5f) / ratio - 0.5f;
      for (int x = 0; x < newW; ++x) {
        const float sourceX =
            (static_cast<float>(x) + 0.5f) / ratio - 0.5f;

        // BGRA -> RGB, then normalize: (pixel - 127.5) / 128.0
        const float r =
            SampleBgraChannel(bgra, width, height, stride, sourceX, sourceY, 2);
        const float g =
            SampleBgraChannel(bgra, width, height, stride, sourceX, sourceY, 1);
        const float b =
            SampleBgraChannel(bgra, width, height, stride, sourceX, sourceY, 0);

        const int destX = x + dw;
        const int destY = y + dh;
        writeChannel(0, destX, destY, (r - 127.5f) / 128.0f);
        writeChannel(1, destX, destY, (g - 127.5f) / 128.0f);
        writeChannel(2, destX, destY, (b - 127.5f) / 128.0f);
      }
    }

    std::lock_guard<std::mutex> ortLock(impl_->ort.mutex);
    if (!impl_->ort.session) {
      return {};
    }

    const std::array<int64_t, 4> inputShape{1, 3, kInputSize, kInputSize};
    Ort::MemoryInfo memoryInfo =
        Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);
    Ort::Value inputTensor = Ort::Value::CreateTensor<float>(
        memoryInfo, input.data(), input.size(), inputShape.data(), inputShape.size());

    if (inputName_.empty() || outputNames_.size() < 9) {
      return {};
    }
    const char *inputNames[] = {inputName_.c_str()};
    const char *outputNames[9] = {
        outputNames_[0].c_str(),
        outputNames_[1].c_str(),
        outputNames_[2].c_str(),
        outputNames_[3].c_str(),
        outputNames_[4].c_str(),
        outputNames_[5].c_str(),
        outputNames_[6].c_str(),
        outputNames_[7].c_str(),
        outputNames_[8].c_str(),
    };

    auto outputs = impl_->ort.session->Run(
        Ort::RunOptions{nullptr},
        inputNames,
        &inputTensor,
        1,
        outputNames,
        9);

    if (outputs.size() < 9) {
      return {};
    }

    auto resolveNumPoints = [](const std::vector<int64_t> &shape,
                               size_t fallback) -> size_t {
      // Named InsightFace export: [1, N, C]. Some 10G exports: [N, C] or [N].
      if (shape.size() == 3 && shape[1] > 1) {
        return static_cast<size_t>(shape[1]);
      }
      if (shape.size() == 2) {
        if (shape[1] == 1 || shape[1] == 4 || shape[1] == 10) {
          return static_cast<size_t>(std::max<int64_t>(0, shape[0]));
        }
        return static_cast<size_t>(std::max<int64_t>(0, shape[1]));
      }
      if (shape.size() == 1) {
        return static_cast<size_t>(std::max<int64_t>(0, shape[0]));
      }
      return fallback;
    };

    std::vector<Candidate> candidates;
    candidates.reserve(1024);

    for (size_t strideIndex = 0; strideIndex < 3; ++strideIndex) {
      const int stride = kStrides[strideIndex];
      const int gridW = kInputSize / stride;
      const int gridH = kInputSize / stride;
      const float *scorePtr = outputs[strideIndex].GetTensorData<float>();
      const float *bboxPtr = outputs[strideIndex + 3].GetTensorData<float>();
      const float *kpsPtr = outputs[strideIndex + 6].GetTensorData<float>();
      const auto scoreShape =
          outputs[strideIndex].GetTensorTypeAndShapeInfo().GetShape();
      const size_t numPoints = resolveNumPoints(
          scoreShape, static_cast<size_t>(gridW * gridH * kNumAnchors));

      unsigned int count = 0;
      for (size_t i = 0; i < numPoints; ++i) {
        const float score = scorePtr[i];
        if (score < scoreThreshold) {
          continue;
        }

        // Anchor index maps to (row, col, anchor) with num_anchors=2.
        const size_t cell = i / static_cast<size_t>(kNumAnchors);
        const float cx = static_cast<float>(cell % static_cast<size_t>(gridW));
        const float cy = static_cast<float>(cell / static_cast<size_t>(gridW));
        const float s = static_cast<float>(stride);

        const float l = bboxPtr[i * 4 + 0];
        const float t = bboxPtr[i * 4 + 1];
        const float r = bboxPtr[i * 4 + 2];
        const float b = bboxPtr[i * 4 + 3];

        Candidate candidate;
        candidate.x1 =
            ((cx - l) * s - static_cast<float>(scaleParams.dw)) / scaleParams.ratio;
        candidate.y1 =
            ((cy - t) * s - static_cast<float>(scaleParams.dh)) / scaleParams.ratio;
        candidate.x2 =
            ((cx + r) * s - static_cast<float>(scaleParams.dw)) / scaleParams.ratio;
        candidate.y2 =
            ((cy + b) * s - static_cast<float>(scaleParams.dh)) / scaleParams.ratio;
        candidate.score = score;

        for (int j = 0; j < 5; ++j) {
          const float kpsL = kpsPtr[i * 10 + j * 2];
          const float kpsT = kpsPtr[i * 10 + j * 2 + 1];
          candidate.landmarks[j * 2] =
              ((cx + kpsL) * s - static_cast<float>(scaleParams.dw)) /
              scaleParams.ratio;
          candidate.landmarks[j * 2 + 1] =
              ((cy + kpsT) * s - static_cast<float>(scaleParams.dh)) /
              scaleParams.ratio;
        }

        candidate.x1 = Clamp(candidate.x1, 0.0f, static_cast<float>(width - 1));
        candidate.y1 = Clamp(candidate.y1, 0.0f, static_cast<float>(height - 1));
        candidate.x2 = Clamp(candidate.x2, 0.0f, static_cast<float>(width - 1));
        candidate.y2 = Clamp(candidate.y2, 0.0f, static_cast<float>(height - 1));
        for (int n = 0; n < 10; n += 2) {
          candidate.landmarks[n] =
              Clamp(candidate.landmarks[n], 0.0f, static_cast<float>(width - 1));
          candidate.landmarks[n + 1] =
              Clamp(candidate.landmarks[n + 1], 0.0f, static_cast<float>(height - 1));
        }

        candidates.push_back(candidate);
        ++count;
        if (count > static_cast<unsigned int>(kMaxNms)) {
          break;
        }
      }
    }

    const auto kept = ApplyNms(std::move(candidates), nmsThreshold);
    std::vector<ScrfdDetection> detections;
    detections.reserve(kept.size());
    for (const auto &candidate : kept) {
      ScrfdDetection detection;
      detection.x1 = candidate.x1;
      detection.y1 = candidate.y1;
      detection.x2 = candidate.x2;
      detection.y2 = candidate.y2;
      detection.score = candidate.score;
      // SCRFD landmark order: right_eye, left_eye, nose, right_mouth, left_mouth
      detection.rightEye = {candidate.landmarks[0], candidate.landmarks[1]};
      detection.leftEye = {candidate.landmarks[2], candidate.landmarks[3]};
      detection.nose = {candidate.landmarks[4], candidate.landmarks[5]};
      detection.rightMouth = {candidate.landmarks[6], candidate.landmarks[7]};
      detection.leftMouth = {candidate.landmarks[8], candidate.landmarks[9]};
      detections.push_back(detection);
    }
    return detections;
  } catch (...) {
    return {};
  }
#endif
}

} // namespace FaceDetection
