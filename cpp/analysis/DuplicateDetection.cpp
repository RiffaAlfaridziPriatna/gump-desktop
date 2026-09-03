#include "DuplicateDetection.h"

#include <algorithm>
#include <cctype>
#include <climits>
#include <cmath>
#include <cstdint>
#include <regex>

namespace Analysis {

int HammingDistance(const std::string &hexA, const std::string &hexB) {
  if (hexA.empty() || hexB.empty() || hexA.length() != hexB.length()) {
    return INT_MAX;
  }

  try {
    uint64_t valueA = std::stoull(hexA, nullptr, 16);
    uint64_t valueB = std::stoull(hexB, nullptr, 16);
    uint64_t xorVal = valueA ^ valueB;
    
    int distance = 0;
    while (xorVal > 0) {
      distance += (xorVal & 1);
      xorVal >>= 1;
    }
    
    return distance;
  } catch (...) {
    return INT_MAX;
  }
}

BurstFileNameParts ParseBurstFileName(const std::string &fileName) {
  if (fileName.empty()) {
    return {};
  }

  // Remove extension
  std::string stem = fileName;
  size_t lastDot = stem.find_last_of('.');
  if (lastDot != std::string::npos) {
    stem = stem.substr(0, lastDot);
  }

  // Match pattern: prefix followed by digits at the end
  std::regex pattern("^(.*?)(\\d+)$");
  std::smatch match;
  
  if (!std::regex_match(stem, match, pattern)) {
    return {};
  }

  std::string prefix = match[1].str();
  // Convert prefix to lowercase
  std::transform(prefix.begin(), prefix.end(), prefix.begin(), ::tolower);
  
  int index;
  try {
    index = std::stoi(match[2].str());
  } catch (...) {
    return {};
  }

  return {prefix, index, true};
}

int BurstFileNameIndexGap(const std::string &fileNameA, const std::string &fileNameB) {
  auto a = ParseBurstFileName(fileNameA);
  auto b = ParseBurstFileName(fileNameB);
  
  if (!a.valid || !b.valid) {
    return -1;
  }
  
  if (a.prefix != b.prefix) {
    return -1;
  }
  
  return std::abs(a.index - b.index);
}

bool ArePerceptualHashesSimilar(const std::string &hashA, const std::string &hashB) {
  if (hashA.empty() || hashB.empty()) {
    return false;
  }
  return HammingDistance(hashA, hashB) <= PERCEPTUAL_HASH_DUPLICATE_THRESHOLD;
}

bool ArePerceptualHashesSameScene(const std::string &hashA, const std::string &hashB, int threshold) {
  if (hashA.empty() || hashB.empty()) {
    return false;
  }
  return HammingDistance(hashA, hashB) <= threshold;
}

bool AreFacesSimilar(const std::vector<FaceDetection::FaceResult> &facesA, 
                     const std::vector<FaceDetection::FaceResult> &facesB) {
  if (facesA.empty() || facesB.empty()) {
    return false;
  }
  if (facesA.size() != facesB.size()) {
    return false;
  }

  std::vector<std::vector<float>> fingerprintsA;
  std::vector<std::vector<float>> fingerprintsB;
  
  for (const auto &face : facesA) {
    fingerprintsA.push_back(FaceFingerprint(face));
  }
  for (const auto &face : facesB) {
    fingerprintsB.push_back(FaceFingerprint(face));
  }

  float totalDistance = 0.0f;

  for (const auto &fpA : fingerprintsA) {
    float minDistance = std::numeric_limits<float>::infinity();
    for (const auto &fpB : fingerprintsB) {
      float dist = FingerprintDistance(fpA, fpB);
      minDistance = std::min(minDistance, dist);
    }
    totalDistance += minDistance;
  }

  float avgDistance = totalDistance / static_cast<float>(fingerprintsA.size());
  return avgDistance < FACE_DUPLICATE_THRESHOLD;
}

float FaceBoxAspect(const BoundingBox &box) {
  return box.width / std::max(box.height, 1e-8f);
}

bool AreFaceFramingsSimilar(const std::vector<FaceDetection::FaceResult> &facesA,
                             const std::vector<FaceDetection::FaceResult> &facesB) {
  if (facesA.empty() || facesB.empty()) {
    return false;
  }
  if (facesA.size() != facesB.size()) {
    return false;
  }

  // Sort faces by area (largest first)
  auto sortedA = facesA;
  auto sortedB = facesB;
  
  std::sort(sortedA.begin(), sortedA.end(), [](const auto &left, const auto &right) {
    BoundingBox boxL{left.left, left.top, left.width, left.height};
    BoundingBox boxR{right.left, right.top, right.width, right.height};
    return FaceBoxArea(boxL) > FaceBoxArea(boxR);
  });
  
  std::sort(sortedB.begin(), sortedB.end(), [](const auto &left, const auto &right) {
    BoundingBox boxL{left.left, left.top, left.width, left.height};
    BoundingBox boxR{right.left, right.top, right.width, right.height};
    return FaceBoxArea(boxL) > FaceBoxArea(boxR);
  });

  for (size_t i = 0; i < sortedA.size(); i++) {
    BoundingBox boxA{sortedA[i].left, sortedA[i].top, sortedA[i].width, sortedA[i].height};
    BoundingBox boxB{sortedB[i].left, sortedB[i].top, sortedB[i].width, sortedB[i].height};
    
    float areaA = FaceBoxArea(boxA);
    float areaB = FaceBoxArea(boxB);
    float minArea = std::min(areaA, areaB);
    
    if (minArea <= 1e-8f) {
      return false;
    }
    
    if (std::max(areaA, areaB) / minArea > FACE_FRAMING_MAX_AREA_RATIO) {
      return false;
    }

    float aspectA = FaceBoxAspect(boxA);
    float aspectB = FaceBoxAspect(boxB);
    float minAspect = std::min(aspectA, aspectB);
    
    if (minAspect <= 1e-8f) {
      return false;
    }
    
    if (std::max(aspectA, aspectB) / minAspect > FACE_FRAMING_MAX_ASPECT_RATIO) {
      return false;
    }
  }

  return true;
}

bool ArePhotosNearDuplicates(const DuplicateDetectionPhoto &photoA, const DuplicateDetectionPhoto &photoB) {
  int indexGap = BurstFileNameIndexGap(photoA.fileName, photoB.fileName);
  if (indexGap < 0 || indexGap > BURST_FILENAME_MAX_INDEX_GAP) {
    return false;
  }

  if (ArePerceptualHashesSimilar(photoA.perceptualHash, photoB.perceptualHash)) {
    return true;
  }

  bool adjacent = indexGap <= ADJACENT_BURST_INDEX_GAP;
  bool hasBothHashes = !photoA.perceptualHash.empty() && !photoB.perceptualHash.empty();

  if (adjacent && hasBothHashes && 
      ArePerceptualHashesSameScene(photoA.perceptualHash, photoB.perceptualHash, 
                                    PERCEPTUAL_HASH_ADJACENT_DUPLICATE_THRESHOLD)) {
    return true;
  }

  int sceneThreshold = adjacent ? PERCEPTUAL_HASH_ADJACENT_SCENE_THRESHOLD : PERCEPTUAL_HASH_SAME_SCENE_THRESHOLD;

  if (hasBothHashes && 
      !ArePerceptualHashesSameScene(photoA.perceptualHash, photoB.perceptualHash, sceneThreshold)) {
    return false;
  }

  // Adjacent burst frames often shift pose/landmarks enough to fail face
  // fingerprinting; similar framing + not-wildly-different pHash is enough.
  if (adjacent && hasBothHashes && AreFaceFramingsSimilar(photoA.faces, photoB.faces)) {
    return true;
  }

  if (!AreFacesSimilar(photoA.faces, photoB.faces)) {
    return false;
  }

  return AreFaceFramingsSimilar(photoA.faces, photoB.faces);
}

int PhotoQualityTier(const DuplicateDetectionPhoto &photo) {
  if (photo.blurred) {
    return 0;
  }
  if (photo.closedEyes) {
    return 1;
  }
  return 2;
}

int CompareDuplicateKeeperPreference(const DuplicateDetectionPhoto &left, const DuplicateDetectionPhoto &right) {
  int tierDelta = PhotoQualityTier(left) - PhotoQualityTier(right);
  if (tierDelta != 0) {
    return tierDelta;
  }

  int starDelta = left.starRating - right.starRating;
  if (starDelta != 0) {
    return starDelta;
  }

  int64_t leftTime = left.capturedAt;
  int64_t rightTime = right.capturedAt;
  if (leftTime == 0) leftTime = INT64_MAX;
  if (rightTime == 0) rightTime = INT64_MAX;
  
  if (leftTime != rightTime) {
    return leftTime < rightTime ? 1 : -1;
  }

  int fileNameDelta = left.fileName.compare(right.fileName);
  if (fileNameDelta != 0) {
    return -fileNameDelta;
  }

  return -left.photoId.compare(right.photoId);
}

void MergeIntoDuplicateGroup(
    const std::string &photoAId,
    const std::string &photoBId,
    std::vector<std::set<std::string>> &duplicateGroups,
    std::map<std::string, size_t> &photoIdToGroupIndex) {
  
  auto itA = photoIdToGroupIndex.find(photoAId);
  auto itB = photoIdToGroupIndex.find(photoBId);

  if (itA != photoIdToGroupIndex.end() && itB != photoIdToGroupIndex.end()) {
    size_t groupIndexA = itA->second;
    size_t groupIndexB = itB->second;
    
    if (groupIndexA != groupIndexB) {
      auto &groupA = duplicateGroups[groupIndexA];
      auto &groupB = duplicateGroups[groupIndexB];
      
      for (const auto &id : groupB) {
        groupA.insert(id);
        photoIdToGroupIndex[id] = groupIndexA;
      }
      groupB.clear();
    }
  } else if (itA != photoIdToGroupIndex.end()) {
    size_t groupIndexA = itA->second;
    duplicateGroups[groupIndexA].insert(photoBId);
    photoIdToGroupIndex[photoBId] = groupIndexA;
  } else if (itB != photoIdToGroupIndex.end()) {
    size_t groupIndexB = itB->second;
    duplicateGroups[groupIndexB].insert(photoAId);
    photoIdToGroupIndex[photoAId] = groupIndexB;
  } else {
    std::set<std::string> newGroup;
    newGroup.insert(photoAId);
    newGroup.insert(photoBId);
    
    size_t newIndex = duplicateGroups.size();
    duplicateGroups.push_back(newGroup);
    photoIdToGroupIndex[photoAId] = newIndex;
    photoIdToGroupIndex[photoBId] = newIndex;
  }
}

std::vector<DuplicateGroup> DetectDuplicates(std::map<std::string, DuplicateDetectionPhoto> &photos) {
  // Reset duplicated flag
  for (auto &[id, photo] : photos) {
    photo.duplicated = false;
  }

  if (photos.size() < 2) {
    return {};
  }

  // Collect and sort by capturedAt
  std::vector<DuplicateDetectionPhoto*> sorted;
  sorted.reserve(photos.size());
  
  for (auto &[id, photo] : photos) {
    sorted.push_back(&photo);
  }

  std::sort(sorted.begin(), sorted.end(), [](const auto *a, const auto *b) {
    int64_t timeA = a->capturedAt;
    int64_t timeB = b->capturedAt;
    return timeA < timeB;
  });

  // Detect duplicates with sliding temporal window
  std::vector<std::set<std::string>> duplicateGroups;
  std::map<std::string, size_t> photoIdToGroupIndex;
  std::vector<DuplicateDetectionPhoto*> processed;
  size_t windowStart = 0;

  for (size_t i = 0; i < sorted.size(); i++) {
    const auto *photoA = sorted[i];
    int64_t aTime = photoA->capturedAt;

    // Advance window start
    while (windowStart < processed.size()) {
      const auto *candidate = processed[windowStart];
      int64_t candidateTime = candidate->capturedAt;
      if (aTime - candidateTime <= DUPLICATE_TEMPORAL_WINDOW_MS) {
        break;
      }
      windowStart++;
    }

    // Check against photos in window
    for (size_t p = windowStart; p < processed.size(); p++) {
      const auto *photoB = processed[p];
      if (!ArePhotosNearDuplicates(*photoA, *photoB)) {
        continue;
      }
      MergeIntoDuplicateGroup(photoA->photoId, photoB->photoId, duplicateGroups, photoIdToGroupIndex);
    }

    processed.push_back(const_cast<DuplicateDetectionPhoto*>(photoA));
  }

  // Finalize duplicate groups
  std::vector<DuplicateGroup> persistedGroups;

  for (const auto &group : duplicateGroups) {
    if (group.size() <= 1) {
      continue;
    }

    std::vector<DuplicateDetectionPhoto*> groupPhotos;
    for (const auto &id : group) {
      auto it = photos.find(id);
      if (it != photos.end()) {
        groupPhotos.push_back(&it->second);
      }
    }

    if (groupPhotos.empty()) {
      continue;
    }

    // Pick best photo
    auto *bestPhoto = groupPhotos[0];
    for (auto *photo : groupPhotos) {
      if (CompareDuplicateKeeperPreference(*photo, *bestPhoto) > 0) {
        bestPhoto = photo;
      }
    }

    // Mark duplicates
    for (auto *photo : groupPhotos) {
      photo->duplicated = (photo->photoId != bestPhoto->photoId);
    }

    // Create group
    DuplicateGroup dg;
    dg.groupId = "dup-" + bestPhoto->photoId + "-" + std::to_string(groupPhotos.size());
    dg.bestPhotoId = bestPhoto->photoId;
    for (auto *photo : groupPhotos) {
      dg.photoIds.push_back(photo->photoId);
    }
    
    persistedGroups.push_back(dg);
  }

  return persistedGroups;
}

} // namespace Analysis
