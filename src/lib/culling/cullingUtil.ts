import { photoStateStore } from '@lib/culledAlbum/photoStateStore';
import { CulledAlbumPhoto } from '@lib/culledAlbum/types';
import { hammingDistance } from '@lib/media/perceptualHash';
import { APIResponse } from '@services/api';

export type CullingFace = APIResponse.CullingFace;
export type CullingPhoto = APIResponse.CullingPhoto;

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

const EYE_OPEN_CONFIDENCE_THRESHOLD = 70;
const EYE_CLOSED_CONFIDENCE_THRESHOLD = 88;
const FOCUS_GOOD_THRESHOLD = 65;
const FOCUS_SOFT_THRESHOLD = 40;

export {
  faceBoxesAreSpatiallyRedundant,
  rejectLikelyDisplayedMediaFaces,
  rejectLikelyNonFaceArtifacts,
  rejectOpenBlurredNonFaces,
  suppressSpatiallyRedundantFaces
} from './faceSpatialDedupe';

export type EyesOpenSignal = {
  value?: boolean;
  confidence?: number;
  leftProbability?: number;
  rightProbability?: number;
};

export function classifyEyeStatus(
  eyesOpen?: EyesOpenSignal,
  _pose?: {pitch?: number},
): APIResponse.CullingEyeStatus {
  if (!eyesOpen || eyesOpen.confidence === undefined) {
    return 'partial';
  }

  const confidence = eyesOpen.confidence;
  const left = eyesOpen.leftProbability;
  const right = eyesOpen.rightProbability;
  const hasProbs =
    typeof left === 'number' &&
    Number.isFinite(left) &&
    typeof right === 'number' &&
    Number.isFinite(right);

  if (hasProbs) {
    const maxOpen = Math.max(left!, right!);
    const minOpen = Math.min(left!, right!);

    if (maxOpen <= 0.22 && minOpen <= 0.18) {
      if (!eyesOpen.value && confidence >= EYE_CLOSED_CONFIDENCE_THRESHOLD) {
        return 'closed';
      }
      if (eyesOpen.value && confidence >= EYE_OPEN_CONFIDENCE_THRESHOLD) {
        return 'open';
      }
      if (confidence >= EYE_CLOSED_CONFIDENCE_THRESHOLD) {
        return 'closed';
      }
      return 'partial';
    }

    if (maxOpen >= 0.45 && minOpen <= 0.22) {
      return maxOpen >= 0.55 ? 'open' : 'partial';
    }
    if (maxOpen >= 0.5 && minOpen >= 0.35) {
      return 'open';
    }
    if (
      maxOpen <= 0.40 &&
      minOpen >= 0.08 &&
      minOpen <= 0.25 &&
      confidence < EYE_OPEN_CONFIDENCE_THRESHOLD + 10
    ) {
      return 'partial';
    }
  }

  if (eyesOpen.value) {
    if (confidence >= EYE_OPEN_CONFIDENCE_THRESHOLD) {
      return 'open';
    }
    return 'partial';
  }

  if (confidence >= EYE_CLOSED_CONFIDENCE_THRESHOLD) {
    return 'closed';
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
export const PERCEPTUAL_HASH_ADJACENT_DUPLICATE_THRESHOLD = 8;
export const PERCEPTUAL_HASH_SAME_SCENE_THRESHOLD = 24;
export const PERCEPTUAL_HASH_ADJACENT_SCENE_THRESHOLD = 30;
export const FACE_FRAMING_MAX_AREA_RATIO = 1.85;
export const FACE_FRAMING_MAX_ASPECT_RATIO = 1.35;
export const DUPLICATE_TEMPORAL_WINDOW_MS = 5 * 60 * 1000;
export const BURST_FILENAME_MAX_INDEX_GAP = 10;
export const ADJACENT_BURST_INDEX_GAP = 2;

export type DuplicateDetectionPhoto = CullingPhoto & {
  capturedAt?: number | null;
  perceptualHash?: string | null;
};

type BurstFileNameParts = {
  prefix: string;
  index: number;
};

export function parseBurstFileName(
  fileName: string | null | undefined,
): BurstFileNameParts | null {
  if (!fileName) {
    return null;
  }
  const stem = fileName.replace(/\.[^.]+$/, '');
  const match = stem.match(/^(.*?)(\d+)$/);
  if (!match) {
    return null;
  }
  const prefix = match[1]!.toLowerCase();
  const index = Number(match[2]);
  if (!Number.isFinite(index)) {
    return null;
  }
  return {prefix, index};
}

export function areFileNamesBurstRelated(
  fileNameA: string | null | undefined,
  fileNameB: string | null | undefined,
): boolean {
  const gap = burstFileNameIndexGap(fileNameA, fileNameB);
  return gap !== null && gap <= BURST_FILENAME_MAX_INDEX_GAP;
}

export function burstFileNameIndexGap(
  fileNameA: string | null | undefined,
  fileNameB: string | null | undefined,
): number | null {
  const a = parseBurstFileName(fileNameA);
  const b = parseBurstFileName(fileNameB);
  if (!a || !b) {
    return null;
  }
  if (a.prefix !== b.prefix) {
    return null;
  }
  return Math.abs(a.index - b.index);
}

export function arePerceptualHashesSimilar(
  hashA: string | null | undefined,
  hashB: string | null | undefined,
): boolean {
  if (!hashA || !hashB) {
    return false;
  }
  return hammingDistance(hashA, hashB) <= PERCEPTUAL_HASH_DUPLICATE_THRESHOLD;
}

export function arePerceptualHashesSameScene(
  hashA: string | null | undefined,
  hashB: string | null | undefined,
  threshold: number = PERCEPTUAL_HASH_SAME_SCENE_THRESHOLD,
): boolean {
  if (!hashA || !hashB) {
    return false;
  }
  return hammingDistance(hashA, hashB) <= threshold;
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

function faceBoxAspect(box: CullingFace['boundingBox']): number {
  return box.width / Math.max(box.height, 1e-8);
}

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

  const sortedA = [...facesA].sort(
    (left, right) =>
      faceBoxArea(right.boundingBox) - faceBoxArea(left.boundingBox),
  );
  const sortedB = [...facesB].sort(
    (left, right) =>
      faceBoxArea(right.boundingBox) - faceBoxArea(left.boundingBox),
  );

  for (let i = 0; i < sortedA.length; i++) {
    const boxA = sortedA[i]!.boundingBox;
    const boxB = sortedB[i]!.boundingBox;
    const areaA = faceBoxArea(boxA);
    const areaB = faceBoxArea(boxB);
    const minArea = Math.min(areaA, areaB);
    if (minArea <= 1e-8) {
      return false;
    }
    if (Math.max(areaA, areaB) / minArea > FACE_FRAMING_MAX_AREA_RATIO) {
      return false;
    }

    const aspectA = faceBoxAspect(boxA);
    const aspectB = faceBoxAspect(boxB);
    const minAspect = Math.min(aspectA, aspectB);
    if (minAspect <= 1e-8) {
      return false;
    }
    if (Math.max(aspectA, aspectB) / minAspect > FACE_FRAMING_MAX_ASPECT_RATIO) {
      return false;
    }
  }

  return true;
}

export function arePhotosNearDuplicates(
  photoA: Pick<DuplicateDetectionPhoto, 'fileName' | 'perceptualHash' | 'faces'>,
  photoB: Pick<DuplicateDetectionPhoto, 'fileName' | 'perceptualHash' | 'faces'>,
): boolean {
  const indexGap = burstFileNameIndexGap(photoA.fileName, photoB.fileName);
  if (indexGap === null || indexGap > BURST_FILENAME_MAX_INDEX_GAP) {
    return false;
  }

  if (
    arePerceptualHashesSimilar(photoA.perceptualHash, photoB.perceptualHash)
  ) {
    return true;
  }

  const adjacent = indexGap <= ADJACENT_BURST_INDEX_GAP;
  const hasBothHashes =
    Boolean(photoA.perceptualHash) && Boolean(photoB.perceptualHash);

  if (
    adjacent &&
    hasBothHashes &&
    arePerceptualHashesSameScene(
      photoA.perceptualHash,
      photoB.perceptualHash,
      PERCEPTUAL_HASH_ADJACENT_DUPLICATE_THRESHOLD,
    )
  ) {
    return true;
  }

  const sceneThreshold = adjacent
    ? PERCEPTUAL_HASH_ADJACENT_SCENE_THRESHOLD
    : PERCEPTUAL_HASH_SAME_SCENE_THRESHOLD;

  if (
    hasBothHashes &&
    !arePerceptualHashesSameScene(
      photoA.perceptualHash,
      photoB.perceptualHash,
      sceneThreshold,
    )
  ) {
    return false;
  }

  // Adjacent burst frames often shift pose/landmarks enough to fail face
  // fingerprinting; similar framing + not-wildly-different pHash is enough.
  if (
    adjacent &&
    hasBothHashes &&
    areFaceFramingsSimilar(photoA.faces, photoB.faces)
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
  fingerprint: number[];
  area: number;
};

export const KEY_FACE_IDENTITY_MERGE_THRESHOLD = 0.08;
export const KEY_FACE_DUP_GROUP_MERGE_THRESHOLD = 0.18;
export const KEY_FACE_IDENTITY_POSE_WEIGHT = 0.2;

export type ComputeKeyFacesOptions = {
  duplicatePhotoGroups?: Array<{photoIds: string[]}>;
};

export function keyFaceIdentityFingerprint(face: CullingFace): number[] {
  const {boundingBox: box, landmarks, pose} = face;
  const eyeLeft = landmarks.find(landmark => landmark.type === 'eyeLeft');
  const eyeRight = landmarks.find(landmark => landmark.type === 'eyeRight');
  const nose = landmarks.find(landmark => landmark.type === 'nose');
  const mouth = landmarks.find(landmark => landmark.type === 'mouth');
  const softYaw = (pose.yaw / 90) * KEY_FACE_IDENTITY_POSE_WEIGHT;
  const softPitch = (pose.pitch / 90) * KEY_FACE_IDENTITY_POSE_WEIGHT;

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
      softYaw,
      softPitch,
    ];
  }

  return [box.width / Math.max(box.height, 1e-6), softYaw, softPitch];
}

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
    fingerprint: keyFaceIdentityFingerprint(face),
    area: faceBoxArea(face.boundingBox),
  };
}

function addFaceToBucket(bucket: VariantBucket, photoId: string): void {
  bucket.occurrenceCount++;
  if (!bucket.photoIdSet.has(photoId)) {
    bucket.photoIdSet.add(photoId);
    bucket.photoIds.push(photoId);
  }
}

function adoptVariantRepresentative(
  bucket: VariantBucket,
  face: CullingFace,
  photoId: string,
  faceIndex: number,
  representativeScore: number,
): void {
  bucket.representativeScore = representativeScore;
  bucket.sourcePhotoId = photoId;
  bucket.sourceFaceIndex = faceIndex;
  bucket.boundingBox = face.boundingBox;
  bucket.sourceCropUri = face.cropUri;
  bucket.fingerprint = keyFaceIdentityFingerprint(face);
  bucket.area = faceBoxArea(face.boundingBox);
}

function compareVariantBucketOrder(a: VariantBucket, b: VariantBucket): number {
  if (a.firstPhotoOrder !== b.firstPhotoOrder) {
    return a.firstPhotoOrder - b.firstPhotoOrder;
  }
  if (a.firstSourceFaceIndex !== b.firstSourceFaceIndex) {
    return a.firstSourceFaceIndex - b.firstSourceFaceIndex;
  }
  return a.faceId.localeCompare(b.faceId);
}

function mergeVariantBucketInto(
  target: VariantBucket,
  source: VariantBucket,
): void {
  target.occurrenceCount += source.occurrenceCount;
  for (const photoId of source.photoIds) {
    if (!target.photoIdSet.has(photoId)) {
      target.photoIdSet.add(photoId);
      target.photoIds.push(photoId);
    }
  }

  if (source.representativeScore > target.representativeScore) {
    target.representativeScore = source.representativeScore;
    target.sourcePhotoId = source.sourcePhotoId;
    target.sourceFaceIndex = source.sourceFaceIndex;
    target.boundingBox = source.boundingBox;
    target.sourceCropUri = source.sourceCropUri;
    target.fingerprint = source.fingerprint;
    target.area = source.area;
  } else if (
    target.fingerprint.length === source.fingerprint.length &&
    target.fingerprint.length > 0
  ) {
    const blended = blendClusterRepresentatives(
      {fingerprint: target.fingerprint, area: target.area},
      {fingerprint: source.fingerprint, area: source.area},
    );
    target.fingerprint = blended.fingerprint;
    target.area = blended.area;
  }

  if (compareVariantBucketOrder(source, target) < 0) {
    target.faceId = source.faceId;
    target.firstPhotoOrder = source.firstPhotoOrder;
    target.firstSourceFaceIndex = source.firstSourceFaceIndex;
  }
}

function buildDuplicatePhotoMembership(
  groups: Array<{photoIds: string[]}> | undefined,
): Map<string, number> {
  const membership = new Map<string, number>();
  if (!groups || groups.length === 0) {
    return membership;
  }
  groups.forEach((group, groupIndex) => {
    for (const photoId of group.photoIds) {
      membership.set(photoId, groupIndex);
    }
  });
  return membership;
}

function collectBucketDuplicateGroups(
  bucket: VariantBucket,
  membership: Map<string, number>,
): Set<number> {
  const groups = new Set<number>();
  if (membership.size === 0) {
    return groups;
  }
  for (const photoId of bucket.photoIdSet) {
    const groupIndex = membership.get(photoId);
    if (groupIndex !== undefined) {
      groups.add(groupIndex);
    }
  }
  return groups;
}

function keyFaceBucketsShareDuplicateGroup(
  leftGroups: Set<number>,
  rightGroups: Set<number>,
): boolean {
  if (leftGroups.size === 0 || rightGroups.size === 0) {
    return false;
  }
  for (const groupIndex of leftGroups) {
    if (rightGroups.has(groupIndex)) {
      return true;
    }
  }
  return false;
}

function keyFaceBucketsShareAnyPhoto(
  left: VariantBucket,
  right: VariantBucket,
): boolean {
  if (left.photoIdSet.size === 0 || right.photoIdSet.size === 0) {
    return false;
  }
  const [smaller, larger] =
    left.photoIdSet.size <= right.photoIdSet.size
      ? [left.photoIdSet, right.photoIdSet]
      : [right.photoIdSet, left.photoIdSet];
  for (const photoId of smaller) {
    if (larger.has(photoId)) {
      return true;
    }
  }
  return false;
}

function keyFaceFramingsCompatible(
  left: VariantBucket,
  right: VariantBucket,
): boolean {
  const boxA = left.boundingBox;
  const boxB = right.boundingBox;
  const areaA = faceBoxArea(boxA);
  const areaB = faceBoxArea(boxB);
  const minArea = Math.min(areaA, areaB);
  if (minArea <= 1e-8) {
    return false;
  }
  if (Math.max(areaA, areaB) / minArea > FACE_FRAMING_MAX_AREA_RATIO) {
    return false;
  }

  const aspectA = faceBoxAspect(boxA);
  const aspectB = faceBoxAspect(boxB);
  const minAspect = Math.min(aspectA, aspectB);
  if (minAspect <= 1e-8) {
    return false;
  }
  if (Math.max(aspectA, aspectB) / minAspect > FACE_FRAMING_MAX_ASPECT_RATIO) {
    return false;
  }

  const centerDistance = Math.hypot(
    boxA.left + boxA.width * 0.5 - (boxB.left + boxB.width * 0.5),
    boxA.top + boxA.height * 0.5 - (boxB.top + boxB.height * 0.5),
  );
  const averageDiagonal =
    (Math.hypot(boxA.width, boxA.height) + Math.hypot(boxB.width, boxB.height)) /
    2;
  return centerDistance < averageDiagonal * 0.55;
}

function keyFaceBucketsAreIdentityRedundant(
  left: VariantBucket,
  right: VariantBucket,
  leftDupGroups: Set<number>,
  rightDupGroups: Set<number>,
): boolean {
  if (
    left.eyeStatus !== right.eyeStatus ||
    left.focusLevel !== right.focusLevel
  ) {
    return false;
  }

  if (keyFaceBucketsShareAnyPhoto(left, right)) {
    return false;
  }

  if (
    left.sourceCropUri &&
    right.sourceCropUri &&
    left.sourceCropUri === right.sourceCropUri
  ) {
    return true;
  }

  if (
    left.fingerprint.length === 0 ||
    left.fingerprint.length !== right.fingerprint.length
  ) {
    return false;
  }

  const distance = fingerprintDistance(left.fingerprint, right.fingerprint);
  if (distance < KEY_FACE_IDENTITY_MERGE_THRESHOLD) {
    return true;
  }

  return (
    distance < KEY_FACE_DUP_GROUP_MERGE_THRESHOLD &&
    keyFaceBucketsShareDuplicateGroup(leftDupGroups, rightDupGroups) &&
    keyFaceFramingsCompatible(left, right)
  );
}

function mergeIdentityRedundantKeyFaceBuckets(
  buckets: VariantBucket[],
  duplicateMembership: Map<string, number>,
): VariantBucket[] {
  if (buckets.length <= 1) {
    return buckets;
  }

  const ordered = [...buckets].sort(compareVariantBucketOrder);
  const kept: VariantBucket[] = [];
  const keptDupGroups: Set<number>[] = [];

  for (const candidate of ordered) {
    const candidateDupGroups = collectBucketDuplicateGroups(
      candidate,
      duplicateMembership,
    );
    let matchIndex = -1;
    for (let index = 0; index < kept.length; index++) {
      if (
        keyFaceBucketsAreIdentityRedundant(
          kept[index]!,
          candidate,
          keptDupGroups[index]!,
          candidateDupGroups,
        )
      ) {
        matchIndex = index;
        break;
      }
    }
    if (matchIndex >= 0) {
      mergeVariantBucketInto(kept[matchIndex]!, candidate);
      for (const groupIndex of candidateDupGroups) {
        keptDupGroups[matchIndex]!.add(groupIndex);
      }
    } else {
      kept.push(candidate);
      keptDupGroups.push(candidateDupGroups);
    }
  }

  return kept;
}

export function computeKeyFaces(
  photos: CullingPhoto[],
  options?: ComputeKeyFacesOptions,
): APIResponse.CullingKeyFace[] {
  const variants = new Map<string, VariantBucket>();
  const duplicateMembership = buildDuplicatePhotoMembership(
    options?.duplicatePhotoGroups,
  );

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
        if (representativeScore > bucket.representativeScore) {
          adoptVariantRepresentative(
            bucket,
            face,
            photo.photoId,
            faceIndex,
            representativeScore,
          );
        }
      }
    });
  });

  return mergeIdentityRedundantKeyFaceBuckets(
    [...variants.values()],
    duplicateMembership,
  )
    .sort(compareVariantBucketOrder)
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

