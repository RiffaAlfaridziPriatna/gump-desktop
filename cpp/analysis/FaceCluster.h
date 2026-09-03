#pragma once

#include "../face-detection/FaceDetectionPipeline.h"

#include <map>
#include <string>
#include <vector>

namespace Analysis {

constexpr float FACE_CLUSTER_CROSS_PHOTO_THRESHOLD = 0.05f;
constexpr float FACE_CLUSTER_MAX_AREA_RATIO = 3.0f;

struct FaceClusterRepresentative {
  std::vector<float> fingerprint;
  float area{0.0f};
};

struct BoundingBox {
  float left{0.0f};
  float top{0.0f};
  float width{0.0f};
  float height{0.0f};
};

std::vector<float> FaceFingerprint(const FaceDetection::FaceResult &face);

float FingerprintDistance(const std::vector<float> &a, const std::vector<float> &b);

float FaceBoxArea(const BoundingBox &box);

bool FaceAreasCompatibleForClustering(float areaA, float areaB);

FaceClusterRepresentative BlendClusterRepresentatives(
    const FaceClusterRepresentative &existing,
    const FaceClusterRepresentative &incoming);

int AssignFaceClustersToSinglePhoto(
    std::vector<FaceDetection::FaceResult> &faces,
    std::map<std::string, FaceClusterRepresentative> &clusterRepresentatives,
    int nextClusterId);

} // namespace Analysis
