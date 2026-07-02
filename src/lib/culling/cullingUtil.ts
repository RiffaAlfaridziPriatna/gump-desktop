import { APIResponse } from '@services/api';
import { hammingDistance } from '@lib/perceptualHash';

export type CullingFace = APIResponse.CullingFace;
export type CullingPhoto = APIResponse.CullingPhoto;

const EYE_CONFIDENCE_THRESHOLD = 85;
const FOCUS_GOOD_THRESHOLD = 40;
const FOCUS_SOFT_THRESHOLD = 22;

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
  return photo[key];
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

function scoreFace(face: CullingFace): number {
  const focusScore =
    face.focusLevel === 'good' ? 2 : face.focusLevel === 'soft' ? 1 : 0;
  const eyeScore =
    face.eyeStatus === 'open' ? 2 : face.eyeStatus === 'partial' ? 1 : 0;
  return focusScore + eyeScore + 1;
}

export function deriveStarRating(faces: CullingFace[]): number {
  if (!faces.length) {
    return 3;
  }

  const average =
    faces.reduce((sum, face) => sum + scoreFace(face), 0) / faces.length;
  return Math.min(5, Math.max(1, Math.round(average)));
}

const FACE_DUPLICATE_THRESHOLD = 0.06;
export const PERCEPTUAL_HASH_DUPLICATE_THRESHOLD = 4;

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

export function detectDuplicates(photos: Record<string, DuplicateDetectionPhoto>) {
  const records = Object.values(photos);
  for (const record of records) {
    record.duplicated = false;
  }

  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const a = records[i]!;
      const b = records[j]!;

      const hasSimilarFaces = areFacesSimilar(a.faces, b.faces);
      const hasSimilarPerceptualHash = arePerceptualHashesSimilar(
        a.perceptualHash,
        b.perceptualHash,
      );

      const isDuplicate = hasSimilarPerceptualHash || hasSimilarFaces;

      if (isDuplicate) {
        a.duplicated = true;
        b.duplicated = true;
      }
    }
  }
}

export function computeStats(photos: CullingPhoto[]): APIResponse.CullingStats {
  const selected = photos.filter(photo => photo.selected);

  return {
    totalPhotos: photos.length,
    mySelections: selected.length,
    aiSelected: photos.filter(photo => photo.aiSelected).length,
    maybe: photos.filter(photo => photo.maybe).length,
    blurred: photos.filter(photo => photo.blurred).length,
    closedEyes: photos.filter(photo => photo.closedEyes).length,
    duplicated: photos.filter(photo => photo.duplicated).length,
  };
}

export function computeKeyFaces(
  photos: CullingPhoto[],
): APIResponse.CullingKeyFace[] {
  const faceIdToPhotoIds = new Map<string, Set<string>>();
  const faceIdToAnalysis = new Map<string, CullingFace>();

  for (const photo of photos) {
    for (const face of photo.faces) {
      const faceId = face.rekognitionFaceId;
      if (!faceId) continue;

      const photoIds = faceIdToPhotoIds.get(faceId) ?? new Set<string>();
      photoIds.add(photo.photoId);
      faceIdToPhotoIds.set(faceId, photoIds);
      if (!faceIdToAnalysis.has(faceId)) {
        faceIdToAnalysis.set(faceId, face);
      }
    }
  }

  return [...faceIdToPhotoIds.entries()]
    .map(([faceId, photoIds]) => {
      const representative = faceIdToAnalysis.get(faceId);
      return {
        faceId,
        photoIds: [...photoIds],
        eyeStatus: representative?.eyeStatus ?? 'partial',
        focusLevel: representative?.focusLevel ?? 'soft',
        occurrenceCount: photoIds.size,
      };
    })
    .sort((a, b) => b.occurrenceCount - a.occurrenceCount);
}

export const FACE_CLUSTER_THRESHOLD = 0.18;

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

