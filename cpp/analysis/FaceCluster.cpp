#include "FaceCluster.h"

#include <algorithm>
#include <cmath>
#include <numeric>
#include <set>

namespace Analysis {

std::vector<float> FaceFingerprint(const FaceDetection::FaceResult &face) {
  const auto &landmarks = face.landmarks;
  const auto &pose = face.pose;
  
  // Convert FaceResult bounding box to BoundingBox struct
  BoundingBox box{face.left, face.top, face.width, face.height};

  // Find landmarks by type
  const FaceDetection::FaceLandmark *eyeLeft = nullptr;
  const FaceDetection::FaceLandmark *eyeRight = nullptr;
  const FaceDetection::FaceLandmark *nose = nullptr;
  const FaceDetection::FaceLandmark *mouth = nullptr;

  for (const auto &landmark : landmarks) {
    if (landmark.type == "eyeLeft") {
      eyeLeft = &landmark;
    } else if (landmark.type == "eyeRight") {
      eyeRight = &landmark;
    } else if (landmark.type == "nose") {
      nose = &landmark;
    } else if (landmark.type == "mouth") {
      mouth = &landmark;
    }
  }

  if (eyeLeft && eyeRight) {
    float eyeMidX = (eyeLeft->x + eyeRight->x) / 2.0f;
    float eyeMidY = (eyeLeft->y + eyeRight->y) / 2.0f;
    float eyeDist = std::hypot(eyeRight->x - eyeLeft->x, eyeRight->y - eyeLeft->y);
    float safeEyeDist = std::max(eyeDist, 1e-6f);
    float aspect = box.width / std::max(box.height, 1e-6f);
    float eyeSpan = eyeDist / std::max(box.width, 1e-6f);
    float noseX = nose ? (nose->x - eyeMidX) / safeEyeDist : 0.0f;
    float noseY = nose ? (nose->y - eyeMidY) / safeEyeDist : 0.0f;
    float mouthX = mouth ? (mouth->x - eyeMidX) / safeEyeDist : 0.0f;
    float mouthY = mouth ? (mouth->y - eyeMidY) / safeEyeDist : 0.0f;

    return {
      aspect,
      eyeSpan,
      noseX,
      noseY,
      mouthX,
      mouthY,
      pose.yaw / 90.0f,
      pose.pitch / 90.0f,
    };
  }

  // Fallback if eyes not found
  return {
    box.width / std::max(box.height, 1e-6f),
    box.left,
    box.top,
    pose.yaw / 90.0f,
    pose.pitch / 90.0f,
  };
}

float FingerprintDistance(const std::vector<float> &a, const std::vector<float> &b) {
  float sum = 0.0f;
  size_t minLen = std::min(a.size(), b.size());
  
  for (size_t i = 0; i < minLen; i++) {
    float diff = a[i] - b[i];
    sum += diff * diff;
  }
  
  return std::sqrt(sum / static_cast<float>(minLen));
}

float FaceBoxArea(const BoundingBox &box) {
  return std::max(0.0f, box.width) * std::max(0.0f, box.height);
}

bool FaceAreasCompatibleForClustering(float areaA, float areaB) {
  float minArea = std::min(areaA, areaB);
  if (minArea <= 1e-8f) {
    return false;
  }
  return std::max(areaA, areaB) / minArea <= FACE_CLUSTER_MAX_AREA_RATIO;
}

FaceClusterRepresentative BlendClusterRepresentatives(
    const FaceClusterRepresentative &existing,
    const FaceClusterRepresentative &incoming) {
  FaceClusterRepresentative result;
  result.area = (existing.area + incoming.area) / 2.0f;
  result.fingerprint.reserve(existing.fingerprint.size());
  
  for (size_t i = 0; i < existing.fingerprint.size(); i++) {
    result.fingerprint.push_back(
        existing.fingerprint[i] * 0.65f + incoming.fingerprint[i] * 0.35f
    );
  }
  
  return result;
}

struct FaceClusterMatch {
  int faceIndex;
  std::string clusterId;
  float distance;
};

int AssignFaceClustersToSinglePhoto(
    std::vector<FaceDetection::FaceResult> &faces,
    std::map<std::string, FaceClusterRepresentative> &clusterRepresentatives,
    int nextClusterId) {
  
  // Compute fingerprints and areas for all faces
  std::vector<std::vector<float>> fingerprints;
  std::vector<float> areas;
  fingerprints.reserve(faces.size());
  areas.reserve(faces.size());
  
  for (const auto &face : faces) {
    fingerprints.push_back(FaceFingerprint(face));
    BoundingBox box{face.left, face.top, face.width, face.height};
    areas.push_back(FaceBoxArea(box));
  }
  
  std::vector<std::string> assignedClusterIds(faces.size());
  
  if (FACE_CLUSTER_CROSS_PHOTO_THRESHOLD > 0) {
    std::vector<FaceClusterMatch> candidateMatches;
    
    // Find all candidate matches
    for (size_t faceIndex = 0; faceIndex < faces.size(); faceIndex++) {
      const auto &fingerprint = fingerprints[faceIndex];
      float area = areas[faceIndex];
      
      for (const auto &[clusterId, representative] : clusterRepresentatives) {
        if (!FaceAreasCompatibleForClustering(area, representative.area)) {
          continue;
        }
        
        float distance = FingerprintDistance(fingerprint, representative.fingerprint);
        if (distance < FACE_CLUSTER_CROSS_PHOTO_THRESHOLD) {
          candidateMatches.push_back({static_cast<int>(faceIndex), clusterId, distance});
        }
      }
    }
    
    // Sort by distance (closest matches first)
    std::sort(candidateMatches.begin(), candidateMatches.end(),
              [](const FaceClusterMatch &a, const FaceClusterMatch &b) {
                return a.distance < b.distance;
              });
    
    // Assign clusters greedily (one face per cluster, one cluster per face)
    std::set<std::string> usedClusterIds;
    for (const auto &match : candidateMatches) {
      if (!assignedClusterIds[match.faceIndex].empty()) {
        continue;
      }
      if (usedClusterIds.count(match.clusterId) > 0) {
        continue;
      }
      
      assignedClusterIds[match.faceIndex] = match.clusterId;
      usedClusterIds.insert(match.clusterId);
      
      // Blend the representative
      auto it = clusterRepresentatives.find(match.clusterId);
      if (it != clusterRepresentatives.end()) {
        FaceClusterRepresentative incoming;
        incoming.fingerprint = fingerprints[match.faceIndex];
        incoming.area = areas[match.faceIndex];
        it->second = BlendClusterRepresentatives(it->second, incoming);
      }
    }
  }
  
  // Assign new cluster IDs for unassigned faces
  for (size_t faceIndex = 0; faceIndex < faces.size(); faceIndex++) {
    if (assignedClusterIds[faceIndex].empty()) {
      std::string clusterId = "person-" + std::to_string(nextClusterId++);
      assignedClusterIds[faceIndex] = clusterId;
      
      FaceClusterRepresentative rep;
      rep.fingerprint = fingerprints[faceIndex];
      rep.area = areas[faceIndex];
      clusterRepresentatives[clusterId] = rep;
    }
    
    // Assign the cluster ID to the face's faceId field
    // (Note: TypeScript uses rekognitionFaceId, but in C++ we'll use faceId)
    faces[faceIndex].faceId = assignedClusterIds[faceIndex];
  }
  
  return nextClusterId;
}

} // namespace Analysis
