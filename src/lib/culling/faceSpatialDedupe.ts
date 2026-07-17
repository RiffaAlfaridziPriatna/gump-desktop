export type FaceBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type SpatiallyDedupableFace = {
  boundingBox: FaceBox;
  landmarks: Array<{type: string}>;
  eyeConfidence: number;
};

export type FaceQualitySignals = {
  eyeStatus: 'open' | 'closed' | 'partial';
  focusLevel: 'good' | 'soft' | 'blurred';
};

const FACE_BOX_IOU_THRESHOLD = 0.42;
const FACE_BOX_IOS_THRESHOLD = 0.5;
const FACE_BOX_PROXIMITY_IOU_THRESHOLD = 0.18;
const FACE_BOX_PROXIMITY_CENTER_FACTOR = 0.48;
const FACE_BOX_PROXIMITY_MIN_AREA_RATIO = 1.8;

function faceBoxArea(box: FaceBox): number {
  return Math.max(0, box.width) * Math.max(0, box.height);
}

function faceBoxIntersectionArea(a: FaceBox, b: FaceBox): number {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.left + a.width, b.left + b.width);
  const bottom = Math.min(a.top + a.height, b.top + b.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

export function faceBoxesAreSpatiallyRedundant(a: FaceBox, b: FaceBox): boolean {
  const intersection = faceBoxIntersectionArea(a, b);
  if (intersection <= 0) {
    return false;
  }

  const areaA = faceBoxArea(a);
  const areaB = faceBoxArea(b);
  const union = areaA + areaB - intersection;
  const iou = union > 0 ? intersection / union : 0;
  if (iou >= FACE_BOX_IOU_THRESHOLD) {
    return true;
  }

  const minArea = Math.min(areaA, areaB);
  const areaRatio = Math.max(areaA, areaB) / Math.max(minArea, 1e-8);
  if (
    minArea > 1e-8 &&
    areaRatio >= FACE_BOX_PROXIMITY_MIN_AREA_RATIO &&
    intersection / minArea >= FACE_BOX_IOS_THRESHOLD
  ) {
    return true;
  }

  if (areaRatio < FACE_BOX_PROXIMITY_MIN_AREA_RATIO) {
    return false;
  }

  const centerDistance = Math.hypot(
    a.left + a.width / 2 - (b.left + b.width / 2),
    a.top + a.height / 2 - (b.top + b.height / 2),
  );
  const minDiagonal = Math.min(
    Math.hypot(a.width, a.height),
    Math.hypot(b.width, b.height),
  );
  return (
    iou >= FACE_BOX_PROXIMITY_IOU_THRESHOLD &&
    centerDistance < FACE_BOX_PROXIMITY_CENTER_FACTOR * minDiagonal
  );
}

function faceLandmarkCompleteness(face: SpatiallyDedupableFace): number {
  return new Set(face.landmarks.map(landmark => landmark.type)).size;
}

function faceSpatialKeepScore(face: SpatiallyDedupableFace): number {
  return (
    faceLandmarkCompleteness(face) * 1_000_000 +
    faceBoxArea(face.boundingBox) * 1_000 +
    face.eyeConfidence
  );
}

export function rejectOpenBlurredNonFaces<T extends FaceQualitySignals>(
  faces: T[],
): T[] {
  return faces.filter(
    face => !(face.eyeStatus === 'open' && face.focusLevel === 'blurred'),
  );
}

export function suppressSpatiallyRedundantFaces<T extends SpatiallyDedupableFace>(
  faces: T[],
): T[] {
  if (faces.length <= 1) {
    return faces;
  }

  const ranked = faces
    .map((face, index) => ({face, index}))
    .sort((left, right) => {
      const scoreDelta =
        faceSpatialKeepScore(right.face) - faceSpatialKeepScore(left.face);
      if (Math.abs(scoreDelta) > 1e-9) {
        return scoreDelta > 0 ? 1 : -1;
      }
      return left.index - right.index;
    });

  const kept: T[] = [];
  for (const candidate of ranked) {
    const overlapsKept = kept.some(existing =>
      faceBoxesAreSpatiallyRedundant(
        candidate.face.boundingBox,
        existing.boundingBox,
      ),
    );
    if (!overlapsKept) {
      kept.push(candidate.face);
    }
  }

  return kept;
}
