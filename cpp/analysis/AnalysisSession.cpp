#include "AnalysisSession.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstddef>
#include <iostream>
#include <queue>

namespace Analysis {
namespace {

ImageRegion ImageRegionFromFace(const FaceDetection::NormalizedRect &rect) {
  return {rect.left, rect.top, rect.width, rect.height};
}

void MeasureFacesOnBuffer(
    FaceDetection::FaceDetectionPipeline &pipeline,
    const DecodedImage &buffer,
    std::vector<FaceDetection::FaceResult> &faces) {
  if (!buffer.success || buffer.bgraPixels == nullptr) {
    return;
  }
  const FaceDetection::NormalizedRect fullFrame{0.0f, 0.0f, 1.0f, 1.0f};
  for (auto &face : faces) {
    pipeline.refineFacePhotometrics(
        face,
        buffer.bgraPixels,
        buffer.width,
        buffer.height,
        buffer.stride,
        fullFrame);
  }
  pipeline.relabelFaces(faces);
}

void MeasureFacesFromHiResCrops(
    FaceDetection::FaceDetectionPipeline &pipeline,
    PlatformDecoder &decoder,
    const std::string &uri,
    int measurementMaxPixelSize,
    std::vector<FaceDetection::FaceResult> &faces) {
  if (faces.empty()) {
    return;
  }

  std::vector<ImageRegion> regions;
  regions.reserve(faces.size());
  for (const auto &face : faces) {
    regions.push_back(ImageRegionFromFace(FaceDetection::paddedMeasurementRect(face)));
  }

  const auto crops = decoder.DecodeImageRegionsToBgra(
      uri, regions, measurementMaxPixelSize);
  bool measuredAny = false;
  const size_t count = std::min(faces.size(), crops.size());
  for (size_t index = 0; index < count; ++index) {
    const auto &crop = crops[index];
    if (!crop.success || crop.bgraPixels == nullptr) {
      continue;
    }
    pipeline.refineFacePhotometrics(
        faces[index],
        crop.bgraPixels,
        crop.width,
        crop.height,
        crop.stride,
        {regions[index].left,
         regions[index].top,
         regions[index].width,
         regions[index].height});
    measuredAny = true;
  }

  if (!measuredAny) {
    auto fallback = decoder.DecodeImageToBgra(
        uri, FaceDetection::kAnalysisMaxPixelSize);
    MeasureFacesOnBuffer(pipeline, fallback, faces);
    return;
  }
  pipeline.relabelFaces(faces);
}

} // namespace


struct PhotoJob {
  PhotoInput input;
  int index{0};
};

struct AnalysisSession::Impl {
  SessionConfig config;
  FaceDetection::FaceDetectionPipeline pipeline;
  
  std::atomic<bool> running{false};
  std::atomic<bool> cancelled{false};
  std::atomic<bool> paused{false};
  
  std::queue<PhotoJob> jobQueue;
  std::mutex queueMutex;
  std::condition_variable queueCondition;
  
  std::vector<AnalysisResult> results;
  std::mutex resultsMutex;
  std::map<std::string, PhotoInput> inputsByPhotoId;
  size_t progressiveEmittedCount{0};

  std::map<std::string, FaceClusterRepresentative> clusterRepresentatives;
  int nextClusterId{0};
  std::mutex clusterMutex;

  std::atomic<int> completedCount{0};
  std::atomic<int> failedCount{0};
  std::atomic<int> dynamicDelayMs{50};

  std::chrono::steady_clock::time_point lastProgressTime;
  std::chrono::steady_clock::time_point batchStartTime;
  std::mutex progressMutex;
  
  std::vector<std::thread> workerThreads;
  std::thread orchestratorThread;

  bool Initialize() {
    if (!config.decoder) {
      return false;
    }

    if (!pipeline.initialize(config.pipelineConfig)) {
      return false;
    }

    return true;
  }

  void EnqueueJobs() {
    std::lock_guard<std::mutex> lock(queueMutex);
    inputsByPhotoId.clear();
    for (size_t i = 0; i < config.photos.size(); i++) {
      PhotoJob job;
      job.input = config.photos[i];
      job.index = static_cast<int>(i);
      jobQueue.push(job);
      inputsByPhotoId[job.input.photoId] = job.input;
    }
  }

  bool GetNextJob(PhotoJob &job) {
    std::unique_lock<std::mutex> lock(queueMutex);
    if (cancelled.load() || !running.load() || jobQueue.empty()) {
      return false;
    }

    job = jobQueue.front();
    jobQueue.pop();
    return true;
  }

  void ProcessPhoto(const PhotoJob &job) {
    AnalysisResult result;
    result.photoId = job.input.photoId;
    result.success = false;

    try {
      // 1. Decode analysis-sized buffer for SCRFD + tiling + dHash.
      auto decoded = config.decoder->DecodeImageToBgra(
          job.input.uri, config.maxDecodePixelSize);
      if (!decoded.success) {
        result.error = "Decode failed: " + decoded.error;
        StoreResult(result);
        return;
      }

      const int detectionLongEdge = std::max(decoded.width, decoded.height);
      const int measurementMax = std::max(config.measurementMaxPixelSize, 1);

      // 2. Detect on the analysis buffer. Photometrics run on hi-res crops
      //    (or a 4096 retry when SCRFD finds nothing).
      result.faces = pipeline.detectFaces(
          decoded.bgraPixels,
          decoded.width,
          decoded.height,
          decoded.stride,
          false);

      bool photometricsDone = false;
      if (result.faces.empty() && detectionLongEdge < measurementMax) {
        auto retry = config.decoder->DecodeImageToBgra(
            job.input.uri, measurementMax);
        if (retry.success) {
          result.faces = pipeline.detectFaces(
              retry.bgraPixels,
              retry.width,
              retry.height,
              retry.stride,
              true);
          photometricsDone = true;
        }
      }

      // Hash on the analysis buffer before dropping it for regional crops.
      if (job.input.existingHash.empty()) {
        auto hashOpt = FaceDetection::differenceHashFromBgra(
            decoded.bgraPixels,
            decoded.width,
            decoded.height,
            decoded.stride);
        if (hashOpt.has_value()) {
          result.perceptualHash = FaceDetection::formatHashHex(hashOpt.value());
        }
      } else {
        result.perceptualHash = job.input.existingHash;
      }

      if (job.input.existingCapturedAt != 0) {
        result.capturedAt = job.input.existingCapturedAt;
      } else {
        result.capturedAt = config.decoder->ReadCapturedAtMillis(job.input.uri);
      }

      if (!result.faces.empty() && !photometricsDone) {
        if (detectionLongEdge < measurementMax) {
          decoded.bgraPixels = nullptr;
          decoded.platformHandle.reset();
          decoded.success = false;
          MeasureFacesFromHiResCrops(
              pipeline,
              *config.decoder,
              job.input.uri,
              measurementMax,
              result.faces);
        } else {
          MeasureFacesOnBuffer(pipeline, decoded, result.faces);
        }
      }

      result.flags = DerivePhotoFlags(result.faces);
      result.starRating = DeriveStarRating(result.faces);
      result.success = true;

    } catch (const std::exception &e) {
      result.error = std::string("Exception: ") + e.what();
    } catch (...) {
      result.error = "Unknown exception";
    }

    StoreResult(result);
  }

  void StoreResult(const AnalysisResult &result) {
    {
      std::lock_guard<std::mutex> lock(resultsMutex);
      results.push_back(result);
    }

    if (result.success) {
      completedCount.fetch_add(1);
    } else {
      failedCount.fetch_add(1);
    }

    SendProgressUpdate();
    EmitProgressiveBatch(false);
  }

  void EmitProgressiveBatch(bool flushRemaining) {
    if (!config.onBatchResults || config.progressiveBatchSize <= 0) {
      return;
    }

    std::vector<AnalysisResult> batch;
    {
      std::lock_guard<std::mutex> lock(resultsMutex);
      const size_t pending = results.size() - progressiveEmittedCount;
      if (pending == 0) {
        return;
      }
      if (!flushRemaining &&
          pending < static_cast<size_t>(config.progressiveBatchSize) &&
          completedCount.load() + failedCount.load() <
              static_cast<int>(config.photos.size())) {
        return;
      }
      batch.assign(
          results.begin() + static_cast<std::ptrdiff_t>(progressiveEmittedCount),
          results.end());
      progressiveEmittedCount = results.size();
    }

    config.onBatchResults(batch);
  }

  std::vector<DuplicateGroup> RunPostProcessing(
      std::vector<AnalysisResult> &sessionResults) {
    clusterRepresentatives.clear();
    nextClusterId = 0;

    std::map<std::string, DuplicateDetectionPhoto> photos;
    for (auto &result : sessionResults) {
      if (!result.success) {
        continue;
      }

      result.flags = DerivePhotoFlags(result.faces);
      result.starRating = DeriveStarRating(result.faces);
      nextClusterId = AssignFaceClustersToSinglePhoto(
          result.faces, clusterRepresentatives, nextClusterId);
      result.faceClusterIds.clear();
      result.faceClusterIds.reserve(result.faces.size());
      for (const auto &face : result.faces) {
        result.faceClusterIds.push_back(face.faceId);
      }

      DuplicateDetectionPhoto photo;
      photo.photoId = result.photoId;
      const auto inputIt = inputsByPhotoId.find(result.photoId);
      if (inputIt != inputsByPhotoId.end()) {
        photo.fileName = inputIt->second.fileName;
      }
      photo.capturedAt = result.capturedAt;
      photo.perceptualHash = result.perceptualHash;
      photo.faces = result.faces;
      photo.blurred = result.flags.blurred;
      photo.closedEyes = result.flags.closedEyes;
      photo.starRating = result.starRating;
      photos.emplace(result.photoId, std::move(photo));
    }

    auto groups = DetectDuplicates(photos);
    for (auto &result : sessionResults) {
      const auto photoIt = photos.find(result.photoId);
      if (photoIt != photos.end()) {
        result.duplicated = photoIt->second.duplicated;
      }
    }
    return groups;
  }

  void SendProgressUpdate() {
    auto now = std::chrono::steady_clock::now();
    
    {
      std::lock_guard<std::mutex> lock(progressMutex);
      auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
          now - lastProgressTime
      ).count();

      if (elapsed < config.progressIntervalMs && 
          completedCount.load() + failedCount.load() < static_cast<int>(config.photos.size())) {
        return;
      }

      lastProgressTime = now;
    }

    if (config.onProgress) {
      ProgressUpdate update;
      update.done = completedCount.load();
      update.total = static_cast<int>(config.photos.size());
      update.failed = failedCount.load();
      config.onProgress(update);
    }
  }

  void WorkerThreadFunc() {
    while (running.load() && !cancelled.load()) {
      // Check if paused
      while (paused.load() && !cancelled.load()) {
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
      }

      if (cancelled.load()) {
        break;
      }

      PhotoJob job;
      if (!GetNextJob(job)) {
        break;
      }

      const auto jobStarted = std::chrono::steady_clock::now();
      ProcessPhoto(job);
      const auto jobMs = std::chrono::duration_cast<std::chrono::milliseconds>(
                             std::chrono::steady_clock::now() - jobStarted)
                             .count();

      if (config.adaptiveConcurrency) {
        int delayMs = dynamicDelayMs.load();
        if (jobMs > 400) {
          delayMs = std::min(delayMs + 25, 200);
        } else if (jobMs < 200) {
          delayMs = std::max(delayMs - 10, config.interJobDelayMs);
        }
        dynamicDelayMs.store(delayMs);
      }

      if (!cancelled.load()) {
        int delayMs = config.adaptiveConcurrency ? dynamicDelayMs.load()
                                                 : config.interJobDelayMs;
        if (delayMs > 0) {
          std::this_thread::sleep_for(std::chrono::milliseconds(delayMs));
        }
      }
    }
  }

  void OrchestratorThreadFunc() {
    // Wait for all workers to complete
    for (auto &thread : workerThreads) {
      if (thread.joinable()) {
        thread.join();
      }
    }

    if (cancelled.load()) {
      running.store(false);
      return;
    }

    EmitProgressiveBatch(true);

    CompletionSummary summary;
    summary.done = completedCount.load();
    summary.total = static_cast<int>(config.photos.size());
    summary.failed = failedCount.load();
    {
      std::lock_guard<std::mutex> lock(resultsMutex);
      summary.results = results;
    }
    summary.duplicateGroups = RunPostProcessing(summary.results);
    {
      std::lock_guard<std::mutex> lock(resultsMutex);
      results = summary.results;
    }

    if (config.onComplete) {
      config.onComplete(summary);
    }

    running.store(false);
  }

  void Start() {
    {
      std::lock_guard<std::mutex> queueLock(queueMutex);
      while (!jobQueue.empty()) {
        jobQueue.pop();
      }
    }
    {
      std::lock_guard<std::mutex> resultsLock(resultsMutex);
      results.clear();
      progressiveEmittedCount = 0;
    }
    clusterRepresentatives.clear();
    nextClusterId = 0;
    completedCount.store(0);
    failedCount.store(0);
    dynamicDelayMs.store(std::max(config.interJobDelayMs, 0));
    workerThreads.clear();

    EnqueueJobs();

    lastProgressTime = std::chrono::steady_clock::now();
    batchStartTime = lastProgressTime;

    // Start worker threads
    for (int i = 0; i < config.maxConcurrency; i++) {
      workerThreads.emplace_back([this]() { WorkerThreadFunc(); });
    }

    // Start orchestrator thread
    orchestratorThread = std::thread([this]() { OrchestratorThreadFunc(); });
  }

  void Stop() {
    running.store(false);
    queueCondition.notify_all();

    for (auto &thread : workerThreads) {
      if (thread.joinable()) {
        thread.join();
      }
    }

    if (orchestratorThread.joinable()) {
      orchestratorThread.join();
    }

    workerThreads.clear();
  }
};

AnalysisSession::AnalysisSession() : impl_(std::make_unique<Impl>()) {}

AnalysisSession::~AnalysisSession() {
  if (impl_->running.load()) {
    Cancel();
  }
}

bool AnalysisSession::Start(const SessionConfig &config) {
  if (impl_->running.load()) {
    return false;
  }

  impl_->config = config;

  if (!impl_->Initialize()) {
    return false;
  }

  impl_->running.store(true);
  impl_->cancelled.store(false);
  impl_->paused.store(false);

  impl_->Start();

  return true;
}

void AnalysisSession::Cancel() {
  impl_->cancelled.store(true);
  impl_->queueCondition.notify_all();
  impl_->Stop();
}

void AnalysisSession::Pause() {
  impl_->paused.store(true);
}

void AnalysisSession::Resume() {
  impl_->paused.store(false);
}

bool AnalysisSession::IsRunning() const {
  return impl_->running.load();
}

} // namespace Analysis
