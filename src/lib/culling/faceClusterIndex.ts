import {CulledAlbumPhoto} from '@lib/culledAlbum/types';
import {
  CullingFace,
  FaceClusterRepresentative,
  faceFingerprint,
} from './cullingUtil';

const clusterIndexes = new Map<
  string,
  Map<string, FaceClusterRepresentative>
>();

export function getFaceClusterIndex(
  albumId: string,
): Map<string, FaceClusterRepresentative> {
  let index = clusterIndexes.get(albumId);
  if (!index) {
    index = new Map();
    clusterIndexes.set(albumId, index);
  }
  return index;
}

export function seedFaceClusterIndex(
  albumId: string,
  photos: CulledAlbumPhoto[],
): void {
  const index = getFaceClusterIndex(albumId);
  if (index.size > 0) {
    return;
  }

  for (const photo of photos) {
    if (photo.analysisStatus !== 'analyzed') {
      continue;
    }
    for (const face of photo.faces) {
      const clusterId = face.rekognitionFaceId;
      const cullingFace = face as CullingFace;
      if (clusterId && !index.has(clusterId)) {
        const box = cullingFace.boundingBox;
        index.set(clusterId, {
          fingerprint: faceFingerprint(cullingFace),
          area: Math.max(0, box.width) * Math.max(0, box.height),
        });
      }
    }
  }
}

export function clearFaceClusterIndex(albumId: string): void {
  clusterIndexes.delete(albumId);
}
