#pragma once

#include "../face-detection/FaceDetectionPipeline.h"
#include "../face-detection/DifferenceHash.h"
#include "../face-detection/ExifDateTime.h"
#include "DuplicateDetection.h"
#include "FaceCluster.h"
#include "PhotoFlags.h"
#include "PlatformDecoder.h"

#include <atomic>
#include <condition_variable>
#include <functional>
#include <map>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace Analysis {

struct PhotoInput {
  std::string photoId;
  std::string uri;
  std::string fileName;
  int64_t existingCapturedAt{0};
  std::string existingHash;
};

struct AnalysisResult {
  std::string photoId;
  std::vector<FaceDetection::FaceResult> faces;
  std::string perceptualHash;
  int64_t capturedAt{0};
  PhotoFlags flags;
  int starRating{0};
  std::vector<std::string> faceClusterIds;
  bool duplicated{false};
  bool success{false};
  std::string error;
};

struct ProgressUpdate {
  int done{0};
  int total{0};
  int failed{0};
};

struct CompletionSummary {
  int done{0};
  int total{0};
  int failed{0};
  std::vector<AnalysisResult> results;
  std::vector<DuplicateGroup> duplicateGroups;
};

using ProgressCallback = std::function<void(const ProgressUpdate &)>;
using BatchCallback = std::function<void(const std::vector<AnalysisResult> &)>;
using CompletionCallback = std::function<void(const CompletionSummary &)>;

struct SessionConfig {
  int maxConcurrency{3};
  int minConcurrency{1};
  int pipelinePoolSize{2};
  int persistBatchSize{50};
  int progressIntervalMs{500};
  int interJobDelayMs{50};
  int maxDecodePixelSize{FaceDetection::kAnalysisMaxPixelSize};
  int measurementMaxPixelSize{FaceDetection::kMeasurementMaxPixelSize};
  int progressiveBatchSize{20};
  bool adaptiveConcurrency{true};
  
  std::string albumId;
  std::vector<PhotoInput> photos;
  
  PlatformDecoder *decoder{nullptr};
  FaceDetection::PipelineConfig pipelineConfig;
  
  ProgressCallback onProgress;
  BatchCallback onBatchResults;
  CompletionCallback onComplete;
};

class AnalysisSession {
public:
  AnalysisSession();
  ~AnalysisSession();

  bool Start(const SessionConfig &config);
  void Cancel();
  void Pause();
  void Resume();
  bool IsRunning() const;

private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

} // namespace Analysis
