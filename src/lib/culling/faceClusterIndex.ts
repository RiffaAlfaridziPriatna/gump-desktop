import {CulledAlbumPhoto} from '@lib/culledAlbum/types';
import {CullingFace, faceFingerprint} from './cullingUtil';

const clusterIndexes = new Map<string, Map<string, number[]>>();

export function getFaceClusterIndex(albumId: string): Map<string, number[]> {
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
      if (clusterId && !index.has(clusterId)) {
        index.set(clusterId, faceFingerprint(face as CullingFace));
      }
    }
  }
}

export function clearFaceClusterIndex(albumId: string): void {
  clusterIndexes.delete(albumId);
}
