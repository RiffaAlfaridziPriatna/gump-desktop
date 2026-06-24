import { APIResponse } from '@services/api';

export type CullingFace = APIResponse.CullingFace;
export type CullingPhoto = APIResponse.CullingPhoto;

const EYE_CONFIDENCE_THRESHOLD = 85;
const FOCUS_GOOD_THRESHOLD = 50;
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

export function derivePhotoFlags(faces: CullingFace[]) {
  if (!faces.length) {
    return {
      aiSelected: true,
      maybe: false,
      blurred: false,
      closedEyes: false,
      selected: true,
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

function areLikelyBurstPhotos(fileNameA: string, fileNameB: string) {
  const baseA = fileNameA.replace(/\.[^.]+$/, '').replace(/\d+$/, '');
  const baseB = fileNameB.replace(/\.[^.]+$/, '').replace(/\d+$/, '');
  return baseA === baseB;
}

export function detectDuplicates(photos: Record<string, CullingPhoto>) {
  const records = Object.values(photos);
  for (const record of records) {
    record.duplicated = false;
  }

  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      const a = records[i]!;
      const b = records[j]!;
      if (a.faces.length !== b.faces.length || a.faces.length === 0) {
        continue;
      }

      if (areLikelyBurstPhotos(a.fileName, b.fileName)) {
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

const FACE_CLUSTER_THRESHOLD = 0.05;

function photoIdFromFaceKey(key: string): string {
  const colonIndex = key.lastIndexOf(':');
  return colonIndex >= 0 ? key.slice(0, colonIndex) : key;
}

function faceFingerprint(face: CullingFace): number[] {
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

function fingerprintDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += (a[i]! - b[i]!) ** 2;
  }
  return Math.sqrt(sum / a.length);
}

class UnionFind {
  private parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
  }

  find(index: number): number {
    if (this.parent[index] !== index) {
      this.parent[index] = this.find(this.parent[index]!);
    }
    return this.parent[index]!;
  }

  union(a: number, b: number): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) {
      this.parent[rootB] = rootA;
    }
  }
}

export function clusterFacesAcrossPhotos(
  photos: CullingPhoto[],
): Map<string, string> {
  type FaceEntry = { key: string; fingerprint: number[] };
  const entries: FaceEntry[] = [];

  for (const photo of photos) {
    photo.faces.forEach((face, faceIndex) => {
      entries.push({
        key: `${photo.photoId}:${faceIndex}`,
        fingerprint: faceFingerprint(face),
      });
    });
  }

  if (entries.length === 0) {
    return new Map();
  }

  const unionFind = new UnionFind(entries.length);
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (
        photoIdFromFaceKey(entries[i]!.key) ===
        photoIdFromFaceKey(entries[j]!.key)
      ) {
        continue;
      }

      if (
        fingerprintDistance(entries[i]!.fingerprint, entries[j]!.fingerprint) <
        FACE_CLUSTER_THRESHOLD
      ) {
        unionFind.union(i, j);
      }
    }
  }

  const rootToCluster = new Map<number, string>();
  let clusterCounter = 0;
  const result = new Map<string, string>();

  for (let i = 0; i < entries.length; i++) {
    const root = unionFind.find(i);
    if (!rootToCluster.has(root)) {
      rootToCluster.set(root, `person-${clusterCounter++}`);
    }
    result.set(entries[i]!.key, rootToCluster.get(root)!);
  }

  return result;
}
