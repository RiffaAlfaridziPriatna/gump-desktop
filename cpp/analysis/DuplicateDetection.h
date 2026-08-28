#pragma once

#include "../face-detection/FaceDetectionPipeline.h"
#include "FaceCluster.h"

#include <map>
#include <set>
#include <string>
#include <vector>

namespace Analysis {

constexpr int PERCEPTUAL_HASH_DUPLICATE_THRESHOLD = 4;
constexpr int PERCEPTUAL_HASH_ADJACENT_DUPLICATE_THRESHOLD = 8;
constexpr int PERCEPTUAL_HASH_SAME_SCENE_THRESHOLD = 24;
constexpr int PERCEPTUAL_HASH_ADJACENT_SCENE_THRESHOLD = 30;
constexpr float FACE_FRAMING_MAX_AREA_RATIO = 1.85f;
constexpr float FACE_FRAMING_MAX_ASPECT_RATIO = 1.35f;
constexpr int64_t DUPLICATE_TEMPORAL_WINDOW_MS = 5 * 60 * 1000;  // 5 minutes
constexpr int BURST_FILENAME_MAX_INDEX_GAP = 10;
constexpr int ADJACENT_BURST_INDEX_GAP = 2;
constexpr float FACE_DUPLICATE_THRESHOLD = 0.06f;

struct BurstFileNameParts {
  std::string prefix;
  int index{0};
  bool valid{false};
};

struct DuplicateDetectionPhoto {
  std::string photoId;
  std::string fileName;
  int64_t capturedAt{0};  // Unix timestamp in milliseconds
  std::string perceptualHash;  // 16-char hex string
  std::vector<FaceDetection::FaceResult> faces;
  bool blurred{false};
  bool closedEyes{false};
  int starRating{0};
  bool duplicated{false};
};

struct DuplicateGroup {
  std::string groupId;
  std::vector<std::string> photoIds;
  std::string bestPhotoId;
};

int HammingDistance(const std::string &hexA, const std::string &hexB);

BurstFileNameParts ParseBurstFileName(const std::string &fileName);

int BurstFileNameIndexGap(const std::string &fileNameA, const std::string &fileNameB);

bool ArePerceptualHashesSimilar(const std::string &hashA, const std::string &hashB);

bool ArePerceptualHashesSameScene(const std::string &hashA, const std::string &hashB, int threshold = PERCEPTUAL_HASH_SAME_SCENE_THRESHOLD);

bool AreFacesSimilar(const std::vector<FaceDetection::FaceResult> &facesA, const std::vector<FaceDetection::FaceResult> &facesB);

bool AreFaceFramingsSimilar(const std::vector<FaceDetection::FaceResult> &facesA, const std::vector<FaceDetection::FaceResult> &facesB);

bool ArePhotosNearDuplicates(const DuplicateDetectionPhoto &photoA, const DuplicateDetectionPhoto &photoB);

int PhotoQualityTier(const DuplicateDetectionPhoto &photo);

int CompareDuplicateKeeperPreference(const DuplicateDetectionPhoto &left, const DuplicateDetectionPhoto &right);

std::vector<DuplicateGroup> DetectDuplicates(std::map<std::string, DuplicateDetectionPhoto> &photos);

} // namespace Analysis
