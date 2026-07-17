import { APIResponse } from '@services/api';
import { hammingDistance } from '@lib/media/perceptualHash';
import { photoStateStore } from '@lib/culledAlbum/photoStateStore';
import { CulledAlbumPhoto } from '@lib/culledAlbum/types';

export type CullingFace = APIResponse.CullingFace;
export type CullingPhoto = APIResponse.CullingPhoto;

/**
 * Orders photos to match the culling grid (filename order / photoOrder store).
 */
export function orderPhotosForCulling<T extends {photoId: string}>(
  albumId: string,
  photos: T[],
  resolveFileName?: (photo: T) => string | undefined,
): T[] {
  const photoOrder = photoStateStore.getState().photoOrder[albumId];
  const byId = new Map(photos.map(photo => [photo.photoId, photo]));

  if (photoOrder && photoOrder.length > 0) {
    const ordered: T[] = [];
    const seen = new Set<string>();

    for (const photoId of photoOrder) {
      const photo = byId.get(photoId);
      if (photo) {
        ordered.push(photo);
        seen.add(photoId);
      }
    }

    for (const photo of photos) {
      if (!seen.has(photo.photoId)) {
        ordered.push(photo);
      }
    }

    return ordered;
  }

  return [...photos].sort((left, right) => {
    const leftName = resolveFileName?.(left) ?? left.photoId;
    const rightName = resolveFileName?.(right) ?? right.photoId;
    return leftName.localeCompare(rightName, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });
}

export function orderCulledAlbumPhotosForCulling(
  albumId: string,
  photos: CulledAlbumPhoto[],
): CulledAlbumPhoto[] {
  return orderPhotosForCulling(
    albumId,
    photos,
    photo => photo.file.name,
  );
}

const EYE_CONFIDENCE_THRESHOLD = 85;
const FOCUS_GOOD_THRESHOLD = 62;
const FOCUS_SOFT_THRESHOLD = 40;

export {
  faceBoxesAreSpatiallyRedundant,
  rejectOpenBlurredNonFaces,
  suppressSpatiallyRedundantFaces,
} from './faceSpatialDedupe';

export function classifyEyeStatus(eyesOpen?: {
  value?: boolean;
  confidence?: number;
}): APIResponse.CullingEyeStatus {
  if (!eyesOpen || eyesOpen.confidence === undefined) {
    return 'partial';
  }
  if (eyesOpen.confidence >= EYE_CONFIDENCE_THRESHOLD) {
    return eyesOpen.value ? 'open' : 'closed';
  }
  return 'partial';
}

export function classifyFocus(
  sharpness?: number | null,
): APIResponse.CullingFocusLevel {
  const value = sharpness ?? 0;
  if (value >= FOCUS_GOOD_THRESHOLD) return 'good';
  if (value >= FOCUS_SOFT_THRESHOLD) return 'soft';
  return 'blurred';
}

export type CullFilterKey =
  | 'aiSelected'
  | 'maybe'
  | 'blurred'
  | 'closedEyes'
  | 'duplicated';

export function matchesCullFilterKey(
  photo: CullingPhoto,
  key: CullFilterKey,
): boolean {
  if (key === 'duplicated') {
    return photo.duplicated;
  }
  return photo[key] && !photo.duplicated;
}

export function derivePhotoFlags(faces: CullingFace[]) {
  if (!faces.length) {
    return {
      aiSelected: false,
      maybe: false,
      blurred: false,
      closedEyes: false,
      selected: false,
    };
  }

  const closedEyes = faces.some(face => face.eyeStatus === 'closed');
  const hasPartial = faces.some(face => face.eyeStatus === 'partial');
  const blurred = faces.some(face => face.focusLevel === 'blurred');
  const hasSoft = faces.some(face => face.focusLevel === 'soft');
  const aiSelected = !closedEyes && !blurred && !hasPartial && !hasSoft;
  const maybe = !closedEyes && !blurred && (hasPartial || hasSoft);

  return {
    aiSelected,
    maybe,
    blurred,
    closedEyes,
    selected: aiSelected || maybe,
  };
}

function faceTier(face: CullingFace): 0 | 1 | 2 {
  if (face.eyeStatus === 'closed' || face.focusLevel === 'blurred') {
    return 0;
  }
  if (face.eyeStatus === 'open' && face.focusLevel === 'good') {
    return 2;
  }
  return 1;
}

export function deriveStarRating(faces: CullingFace[]): number {
  if (!faces.length) {
    return 0;
  }

  const tiers = faces.map(faceTier);
  const hasLow = tiers.some(t => t === 0);
  const hasPartialOrSoft = tiers.some(t => t === 1);

  if (!hasLow && !hasPartialOrSoft) {
    return 5;
  }
  if (!hasLow) {
    return 4;
  }

  const avg = tiers.reduce((s, t) => s + t, 0 as number) / (tiers.length * 2);
  if (avg <= 1 / 3) {
    return 1;
  }
  if (avg >= 2 / 3) {
    return 3;
  }
  return 2;
}

const FACE_DUPLICATE_THRESHOLD = 0.06;
export const PERCEPTUAL_HASH_DUPLICATE_THRESHOLD = 4;
/**
 * Max larger/smaller face-area ratio still treated as the same framing/zoom.
 * Close-up vs wide of the same person typically exceeds this.
 */
export const FACE_FRAMING_MAX_AREA_RATIO = 1.85;
/** Burst / near-duplicate candidates must fall within this capture-time window. */
export const DUPLICATE_TEMPORAL_WINDOW_MS = 5 * 60 * 1000;

export type DuplicateDetectionPhoto = CullingPhoto & {
  capturedAt?: number | null;
  perceptualHash?: string | null;
};

export function arePerceptualHashesSimilar(
  hashA: string | null | undefined,
  hashB: string | null | undefined,
): boolean {
  if (!hashA || !hashB) {
    return false;
  }
  return hammingDistance(hashA, hashB) <= PERCEPTUAL_HASH_DUPLICATE_THRESHOLD;
}

export function areFacesSimilar(facesA: CullingFace[], facesB: CullingFace[]): boolean {
  if (facesA.length === 0 || facesB.length === 0) {
    return false;
  }
  if (facesA.length !== facesB.length) {
    return false;
  }

  const fingerprintsA = facesA.map(faceFingerprint);
  const fingerprintsB = facesB.map(faceFingerprint);

  let totalDistance = 0;

  for (const fpA of fingerprintsA) {
    let minDistance = Infinity;
    for (const fpB of fingerprintsB) {
      const dist = fingerprintDistance(fpA, fpB);
      minDistance = Math.min(minDistance, dist);
    }
    totalDistance += minDistance;
  }

  const avgDistance = totalDistance / fingerprintsA.length;
  return avgDistance < FACE_DUPLICATE_THRESHOLD;
}

function faceBoxArea(box: CullingFace['boundingBox']): number {
  return Math.max(0, box.width) * Math.max(0, box.height);
}

/**
 * True when face sizes in-frame are similar (same zoom / crop), independent of
 * identity fingerprint. Sorted by area so multi-face photos pair largest-to-largest.
 */
export function areFaceFramingsSimilar(
  facesA: CullingFace[],
  facesB: CullingFace[],
): boolean {
  if (facesA.length === 0 || facesB.length === 0) {
    return false;
  }
  if (facesA.length !== facesB.length) {
    return false;
  }

  const areasA = facesA.map(face => faceBoxArea(face.boundingBox)).sort((a, b) => b - a);
  const areasB = facesB.map(face => faceBoxArea(face.boundingBox)).sort((a, b) => b - a);

  for (let i = 0; i < areasA.length; i++) {
    const areaA = areasA[i]!;
    const areaB = areasB[i]!;
    const minArea = Math.min(areaA, areaB);
    if (minArea <= 1e-8) {
      return false;
    }
    if (Math.max(areaA, areaB) / minArea > FACE_FRAMING_MAX_AREA_RATIO) {
      return false;
    }
  }

  return true;
}

/**
 * Near-duplicate rule for burst culling:
 * - similar perceptual hash (same composition), or
 * - similar faces AND similar framing (same person, same zoom — not close-up vs wide)
 */
export function arePhotosNearDuplicates(
  photoA: Pick<DuplicateDetectionPhoto, 'perceptualHash' | 'faces'>,
  photoB: Pick<DuplicateDetectionPhoto, 'perceptualHash' | 'faces'>,
): boolean {
  if (
    arePerceptualHashesSimilar(photoA.perceptualHash, photoB.perceptualHash)
  ) {
    return true;
  }

  if (!areFacesSimilar(photoA.faces, photoB.faces)) {
    return false;
  }

  return areFaceFramingsSimilar(photoA.faces, photoB.faces);
}

export function computeStats(photos: CullingPhoto[]): APIResponse.CullingStats {
  const selected = photos.filter(photo => photo.selected);

  return {
    totalPhotos: photos.length,
    mySelections: selected.length,
    aiSelected: photos.filter(photo => matchesCullFilterKey(photo, 'aiSelected')).length,
    maybe: photos.filter(photo => matchesCullFilterKey(photo, 'maybe')).length,
    blurred: photos.filter(photo => matchesCullFilterKey(photo, 'blurred')).length,
    closedEyes: photos.filter(photo => matchesCullFilterKey(photo, 'closedEyes')).length,
    duplicated: photos.filter(photo => matchesCullFilterKey(photo, 'duplicated')).length,
  };
}

const KEY_FACE_VARIANT_SEP = '::';

export function buildKeyFaceVariantId(
  clusterId: string,
  eyeStatus: APIResponse.CullingEyeStatus,
  focusLevel: APIResponse.CullingFocusLevel,
): string {
  return `${clusterId}${KEY_FACE_VARIANT_SEP}${eyeStatus}${KEY_FACE_VARIANT_SEP}${focusLevel}`;
}

export function parseKeyFaceVariantId(faceId: string): {
  clusterId: string;
  eyeStatus: APIResponse.CullingEyeStatus;
  focusLevel: APIResponse.CullingFocusLevel;
} | null {
  const parts = faceId.split(KEY_FACE_VARIANT_SEP);
  if (parts.length !== 3) {
    return null;
  }

  const [clusterId, eyeStatus, focusLevel] = parts;
  if (
    eyeStatus !== 'open' &&
    eyeStatus !== 'partial' &&
    eyeStatus !== 'closed'
  ) {
    return null;
  }
  if (
    focusLevel !== 'good' &&
    focusLevel !== 'soft' &&
    focusLevel !== 'blurred'
  ) {
    return null;
  }

  return {
    clusterId: clusterId!,
    eyeStatus,
    focusLevel,
  };
}

export function resolveFaceClusterIdInPhoto(
  face: CullingFace,
  photoId: string,
  faceIndex: number,
  facesInPhoto: CullingFace[],
): string {
  let clusterId = face.rekognitionFaceId;
  if (!clusterId) {
    return `${photoId}#${faceIndex}`;
  }

  for (let index = 0; index < faceIndex; index++) {
    if (facesInPhoto[index]?.rekognitionFaceId === clusterId) {
      return `${photoId}#${faceIndex}`;
    }
  }

  return clusterId;
}

function scoreKeyFaceRepresentative(
  face: CullingFace,
  photoOrder: number,
): number {
  let score = 0;

  if (face.eyeStatus === 'open') {
    score += 400;
  } else if (face.eyeStatus === 'partial') {
    score += 200;
  }

  if (face.focusLevel === 'good') {
    score += 300;
  } else if (face.focusLevel === 'soft') {
    score += 150;
  }

  score += Math.min(face.sharpness ?? 0, 100);
  score += Math.max(
    0,
    100 - Math.abs(face.pose.yaw) - Math.abs(face.pose.pitch),
  );
  score += face.boundingBox.width * face.boundingBox.height * 500;
  score -= photoOrder * 10;

  return score;
}

type VariantBucket = {
  faceId: string;
  photoIds: string[];
  photoIdSet: Set<string>;
  eyeStatus: APIResponse.CullingEyeStatus;
  focusLevel: APIResponse.CullingFocusLevel;
  occurrenceCount: number;
  firstPhotoOrder: number;
  firstSourceFaceIndex: number;
  sourcePhotoId: string;
  sourceFaceIndex: number;
  boundingBox: CullingFace['boundingBox'];
  sourceCropUri?: string;
  representativeScore: number;
};

function createVariantBucket(
  variantId: string,
  face: CullingFace,
  photoId: string,
  faceIndex: number,
  photoOrder: number,
  representativeScore: number,
): VariantBucket {
  return {
    faceId: variantId,
    photoIds: [],
    photoIdSet: new Set(),
    eyeStatus: face.eyeStatus,
    focusLevel: face.focusLevel,
    occurrenceCount: 0,
    firstPhotoOrder: photoOrder,
    firstSourceFaceIndex: faceIndex,
    sourcePhotoId: photoId,
    sourceFaceIndex: faceIndex,
    boundingBox: face.boundingBox,
    sourceCropUri: face.cropUri,
    representativeScore,
  };
}

function addFaceToBucket(bucket: VariantBucket, photoId: string): void {
  bucket.occurrenceCount++;
  if (!bucket.photoIdSet.has(photoId)) {
    bucket.photoIdSet.add(photoId);
    bucket.photoIds.push(photoId);
  }
}

export function computeKeyFaces(
  photos: CullingPhoto[],
): APIResponse.CullingKeyFace[] {
  const variants = new Map<string, VariantBucket>();

  photos.forEach((photo, photoOrder) => {
    const usedClusterIdsInPhoto = new Set<string>();

    photo.faces.forEach((face, faceIndex) => {
      let clusterId = face.rekognitionFaceId;
      if (!clusterId || usedClusterIdsInPhoto.has(clusterId)) {
        clusterId = `${photo.photoId}#${faceIndex}`;
      } else {
        usedClusterIdsInPhoto.add(clusterId);
      }

      const variantId = buildKeyFaceVariantId(
        clusterId,
        face.eyeStatus,
        face.focusLevel,
      );
      const representativeScore = scoreKeyFaceRepresentative(face, photoOrder);

      const bucket = variants.get(variantId);
      if (!bucket) {
        const newBucket = createVariantBucket(
          variantId,
          face,
          photo.photoId,
          faceIndex,
          photoOrder,
          representativeScore,
        );
        variants.set(variantId, newBucket);
        addFaceToBucket(newBucket, photo.photoId);
      } else {
        addFaceToBucket(bucket, photo.photoId);
      }
    });
  });

  return [...variants.values()]
    .sort((a, b) => {
      if (a.firstPhotoOrder !== b.firstPhotoOrder) {
        return a.firstPhotoOrder - b.firstPhotoOrder;
      }
      if (a.firstSourceFaceIndex !== b.firstSourceFaceIndex) {
        return a.firstSourceFaceIndex - b.firstSourceFaceIndex;
      }
      return a.faceId.localeCompare(b.faceId);
    })
    .map(
      ({
        faceId,
        photoIds,
        eyeStatus,
        focusLevel,
        occurrenceCount,
        sourcePhotoId,
        sourceFaceIndex,
        boundingBox,
        sourceCropUri,
      }) => ({
        faceId,
        photoIds,
        eyeStatus,
        focusLevel,
        occurrenceCount,
        sourcePhotoId,
        sourceFaceIndex,
        boundingBox,
        cropUri: sourceCropUri,
      }),
    );
}

export const FACE_CLUSTER_CROSS_PHOTO_THRESHOLD = 0.05;

export const FACE_CLUSTER_MAX_AREA_RATIO = 3;

export type FaceClusterRepresentative = {
  fingerprint: number[];
  area: number;
};

function faceAreasCompatibleForClustering(
  areaA: number,
  areaB: number,
): boolean {
  const minArea = Math.min(areaA, areaB);
  if (minArea <= 1e-8) {
    return false;
  }
  return Math.max(areaA, areaB) / minArea <= FACE_CLUSTER_MAX_AREA_RATIO;
}

function blendClusterRepresentatives(
  existing: FaceClusterRepresentative,
  incoming: FaceClusterRepresentative,
): FaceClusterRepresentative {
  return {
    fingerprint: existing.fingerprint.map(
      (value, index) => value * 0.65 + incoming.fingerprint[index]! * 0.35,
    ),
    area: existing.area * 0.65 + incoming.area * 0.35,
  };
}

type FaceClusterMatch = {
  faceIndex: number;
  clusterId: string;
  distance: number;
};

/**
 * Assigns a cluster id to every face in a single photo.
 *
 * Every face in one photo is a distinct person, so each existing cluster can be
 * reused at most once per photo. This guarantees a group photo acts as a lower
 * bound: N faces in one photo always yield at least N unique clusters overall.
 *
 * Matching against clusters from other photos is done globally (best pairs
 * first) instead of greedily per face, so the closest face/cluster pairs win
 * and the rest become new people.
 */
export function assignFaceClustersToSinglePhoto(
  faces: CullingFace[],
  clusterRepresentatives: Map<string, FaceClusterRepresentative>,
  nextClusterId: number,
): number {
  const fingerprints = faces.map(faceFingerprint);
  const areas = faces.map(face => faceBoxArea(face.boundingBox));
  const assignedClusterIds: (string | null)[] = new Array(faces.length).fill(
    null,
  );

  if (FACE_CLUSTER_CROSS_PHOTO_THRESHOLD > 0) {
    const candidateMatches: FaceClusterMatch[] = [];
    for (let faceIndex = 0; faceIndex < faces.length; faceIndex++) {
      const fingerprint = fingerprints[faceIndex]!;
      const area = areas[faceIndex]!;
      for (const [clusterId, representative] of clusterRepresentatives) {
        if (!faceAreasCompatibleForClustering(area, representative.area)) {
          continue;
        }
        const distance = fingerprintDistance(
          fingerprint,
          representative.fingerprint,
        );
        if (distance < FACE_CLUSTER_CROSS_PHOTO_THRESHOLD) {
          candidateMatches.push({faceIndex, clusterId, distance});
        }
      }
    }

    candidateMatches.sort((a, b) => a.distance - b.distance);

    const usedClusterIds = new Set<string>();
    for (const match of candidateMatches) {
      if (assignedClusterIds[match.faceIndex] !== null) {
        continue;
      }
      if (usedClusterIds.has(match.clusterId)) {
        continue;
      }
      assignedClusterIds[match.faceIndex] = match.clusterId;
      usedClusterIds.add(match.clusterId);
      const representative = clusterRepresentatives.get(match.clusterId);
      if (representative) {
        clusterRepresentatives.set(
          match.clusterId,
          blendClusterRepresentatives(representative, {
            fingerprint: fingerprints[match.faceIndex]!,
            area: areas[match.faceIndex]!,
          }),
        );
      }
    }
  }

  for (let faceIndex = 0; faceIndex < faces.length; faceIndex++) {
    let clusterId = assignedClusterIds[faceIndex];
    if (!clusterId) {
      clusterId = `person-${nextClusterId++}`;
      clusterRepresentatives.set(clusterId, {
        fingerprint: fingerprints[faceIndex]!,
        area: areas[faceIndex]!,
      });
    }
    faces[faceIndex]!.rekognitionFaceId = clusterId;
  }

  return nextClusterId;
}

export function faceFingerprint(face: CullingFace): number[] {
  const { boundingBox: box, landmarks, pose } = face;
  const eyeLeft = landmarks.find(landmark => landmark.type === 'eyeLeft');
  const eyeRight = landmarks.find(landmark => landmark.type === 'eyeRight');
  const nose = landmarks.find(landmark => landmark.type === 'nose');
  const mouth = landmarks.find(landmark => landmark.type === 'mouth');

  if (eyeLeft && eyeRight) {
    const eyeMidX = (eyeLeft.x + eyeRight.x) / 2;
    const eyeMidY = (eyeLeft.y + eyeRight.y) / 2;
    const eyeDist = Math.hypot(eyeRight.x - eyeLeft.x, eyeRight.y - eyeLeft.y);
    const safeEyeDist = Math.max(eyeDist, 1e-6);
    const aspect = box.width / Math.max(box.height, 1e-6);
    const eyeSpan = eyeDist / Math.max(box.width, 1e-6);
    const noseX = nose ? (nose.x - eyeMidX) / safeEyeDist : 0;
    const noseY = nose ? (nose.y - eyeMidY) / safeEyeDist : 0;
    const mouthX = mouth ? (mouth.x - eyeMidX) / safeEyeDist : 0;
    const mouthY = mouth ? (mouth.y - eyeMidY) / safeEyeDist : 0;

    return [
      aspect,
      eyeSpan,
      noseX,
      noseY,
      mouthX,
      mouthY,
      pose.yaw / 90,
      pose.pitch / 90,
    ];
  }

  return [
    box.width / Math.max(box.height, 1e-6),
    box.left,
    box.top,
    pose.yaw / 90,
    pose.pitch / 90,
  ];
}

export function fingerprintDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i]! - b[i]!) ** 2;
  }
  return Math.sqrt(sum / a.length);
}

