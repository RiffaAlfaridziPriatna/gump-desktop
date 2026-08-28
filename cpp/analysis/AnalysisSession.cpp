#include "AnalysisSession.h"

#include <chrono>
#include <iostream>
#include <queue>

namespace Analysis {

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
  
  std::map<std::string, FaceClusterRepresentative> clusterRepresentatives;
  int nextClusterId{0};
  std::mutex clusterMutex;
  
  std::atomic<int> completedCount{0};
  std::atomic<int> failedCount{0};
  
  std::chrono::steady_clock::time_point lastProgressTime;
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
    for (size_t i = 0; i < config.photos.size(); i++) {
      PhotoJob job;
      job.input = config.photos[i];
      job.index = static_cast<int>(i);
      jobQueue.push(job);
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
      // 1. Decode image
      auto decoded = config.decoder->DecodeImageToBgra(job.input.uri);
      if (!decoded.success) {
        result.error = "Decode failed: " + decoded.error;
        StoreResult(result);
        return;
      }

      // 2. Detect faces
      result.faces = pipeline.detectFaces(
          decoded.bgraPixels, 
          decoded.width, 
          decoded.height, 
          decoded.stride
      );

      // 3. Compute perceptual hash
      if (job.input.existingHash.empty()) {
        auto hashOpt = FaceDetection::differenceHashFromBgra(
            decoded.bgraPixels, 
            decoded.width, 
            decoded.height, 
            decoded.stride
        );
        if (hashOpt.has_value()) {
          result.perceptualHash = FaceDetection::formatHashHex(hashOpt.value());
        }
      } else {
        result.perceptualHash = job.input.existingHash;
      }

      // 4. Read captured timestamp
      if (job.input.existingCapturedAt != 0) {
        result.capturedAt = job.input.existingCapturedAt;
      } else {
        result.capturedAt = config.decoder->ReadCapturedAtMillis(job.input.uri);
      }

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

      ProcessPhoto(job);
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

    CompletionSummary summary;
    summary.done = completedCount.load();
    summary.total = static_cast<int>(config.photos.size());
    summary.failed = failedCount.load();
    {
      std::lock_guard<std::mutex> lock(resultsMutex);
      summary.results = results;
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
    }
    completedCount.store(0);
    failedCount.store(0);
    workerThreads.clear();

    EnqueueJobs();

    lastProgressTime = std::chrono::steady_clock::now();

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
