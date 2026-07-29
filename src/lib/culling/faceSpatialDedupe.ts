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

export type MediaRejectableFace = {
  boundingBox: FaceBox;
  pose?: {yaw?: number; pitch?: number; roll?: number};
  /** When present, sharp real people are not treated as wall/screen faces. */
  sharpness?: number | null;
  focusLevel?: 'good' | 'soft' | 'blurred';
};

const FACE_BOX_IOU_THRESHOLD = 0.42;
const FACE_BOX_IOS_THRESHOLD = 0.5;
const FACE_BOX_PROXIMITY_IOU_THRESHOLD = 0.18;
const FACE_BOX_PROXIMITY_CENTER_FACTOR = 0.48;
const FACE_BOX_PROXIMITY_MIN_AREA_RATIO = 1.8;
const MIN_KEEP_FACE_AREA = 0.0004;
const MIN_SOFT_FACE_AREA = 0.012;
const RELATIVE_TINY_FACE_AREA = 0.00075;
const RELATIVE_TINY_FACE_MAX_RATIO = 0.5;
const RELATIVE_TINY_DEFER_MEDIA_RATIO = 8;
const DISPLAYED_MEDIA_MIN_AREA = 0.0035;
const DISPLAYED_MEDIA_MAX_AREA = 0.16;
const DISPLAYED_MEDIA_MIN_PERSON_AREA = 0.0004;
const DISPLAYED_MEDIA_SIDE_SIMILAR_MAX_FACES = 6;
/** Soft/screen faces; sharp event subjects must not hit media rejects. */
const DISPLAYED_MEDIA_MAX_SHARPNESS = 48;

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

/**
 * Normalize pose yaw to radians for media-reject gates.
 * Vision and shared SCRFD both emit radians. Legacy / mistaken degree values
 * (|yaw| > π) are converted so old cached analyses still filter sanely.
 */
function absYawRadians(yaw: number): number {
  const value = Math.abs(yaw);
  if (value > Math.PI + 0.01) {
    return (value * Math.PI) / 180;
  }
  return value;
}

function faceCenter(box: FaceBox): {x: number; y: number} {
  return {
    x: box.left + box.width * 0.5,
    y: box.top + box.height * 0.5,
  };
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

export function rejectLikelyNonFaceArtifacts<
  T extends FaceQualitySignals & {boundingBox: FaceBox},
>(faces: T[]): T[] {
  if (faces.length === 0) {
    return faces;
  }

  const areas = faces
    .map(face => faceBoxArea(face.boundingBox))
    .filter(area => area > 0)
    .sort((a, b) => a - b);
  const upperHalf = areas.slice(Math.floor(areas.length / 2));
  const referenceArea =
    upperHalf.length === 0
      ? 0
      : upperHalf.reduce((sum, area) => sum + area, 0) / upperHalf.length;

  return faces.filter(face => {
    const area = faceBoxArea(face.boundingBox);
    if (area < MIN_KEEP_FACE_AREA) {
      return false;
    }
    if (
      faces.length >= 2 &&
      referenceArea > 0 &&
      area < RELATIVE_TINY_FACE_AREA &&
      area < referenceArea * RELATIVE_TINY_FACE_MAX_RATIO
    ) {
      const sizeRatio = referenceArea / Math.max(area, 1e-8);
      let deferToMediaFilter = false;
      if (sizeRatio >= RELATIVE_TINY_DEFER_MEDIA_RATIO) {
        const center = faceCenter(face.boundingBox);
        deferToMediaFilter = faces.some(other => {
          const otherArea = faceBoxArea(other.boundingBox);
          if (otherArea < referenceArea * 0.85) {
            return false;
          }
          const otherCenter = faceCenter(other.boundingBox);
          return otherCenter.y + 0.03 < center.y;
        });
      }
      if (!deferToMediaFilter) {
        return false;
      }
    }
    if (
      faces.length >= 2 &&
      face.focusLevel === 'soft' &&
      area < MIN_SOFT_FACE_AREA &&
      referenceArea >= MIN_SOFT_FACE_AREA
    ) {
      if (
        !(
          referenceArea > 0 &&
          area >= referenceArea * RELATIVE_TINY_FACE_MAX_RATIO
        )
      ) {
        return false;
      }
    }
    if (face.eyeStatus === 'open' && face.focusLevel === 'blurred') {
      return false;
    }
    return true;
  });
}

export function rejectLikelyDisplayedMediaFaces<
  T extends MediaRejectableFace,
>(faces: T[]): T[] {
  if (faces.length < 2) {
    return faces;
  }

  const meta = faces.map((face, index) => {
    const area = faceBoxArea(face.boundingBox);
    const center = faceCenter(face.boundingBox);
    const sharpness = face.sharpness ?? 0;
    const softMedia =
      face.focusLevel === 'blurred' ||
      sharpness < DISPLAYED_MEDIA_MAX_SHARPNESS;
    return {
      index,
      area,
      centerX: center.x,
      centerY: center.y,
      yaw: absYawRadians(face.pose?.yaw ?? 0),
      softMedia,
    };
  });

  const reject = new Set<number>();

  for (const candidate of meta) {
    if (!candidate.softMedia) {
      continue;
    }

    const smallerLowerPeople = meta.filter(
      other =>
        other.index !== candidate.index &&
        other.area >= DISPLAYED_MEDIA_MIN_PERSON_AREA &&
        other.area < candidate.area &&
        other.centerY > candidate.centerY + 0.04,
    );
    if (
      candidate.area >= DISPLAYED_MEDIA_MIN_AREA &&
      candidate.area <= DISPLAYED_MEDIA_MAX_AREA &&
      smallerLowerPeople.some(
        other => candidate.area / Math.max(other.area, 1e-8) >= 3,
      )
    ) {
      reject.add(candidate.index);
      continue;
    }

    const onSide = candidate.centerX <= 0.38 || candidate.centerX >= 0.62;
    if (
      meta.length <= DISPLAYED_MEDIA_SIDE_SIMILAR_MAX_FACES &&
      (candidate.centerX <= 0.32 || candidate.centerX >= 0.68) &&
      candidate.area >= DISPLAYED_MEDIA_MIN_AREA &&
      candidate.area <= DISPLAYED_MEDIA_MAX_AREA
    ) {
      const sidePanelNearPerson = meta.some(other => {
        if (other.index === candidate.index) {
          return false;
        }
        if (other.area < DISPLAYED_MEDIA_MIN_AREA * 0.5) {
          return false;
        }
        const areaRatio = candidate.area / Math.max(other.area, 1e-8);
        if (areaRatio < 0.4 || areaRatio > 2.5) {
          return false;
        }
        const candidateEdge = Math.abs(candidate.centerX - 0.5);
        const otherEdge = Math.abs(other.centerX - 0.5);
        if (candidateEdge < otherEdge + 0.2) {
          return false;
        }
        if (candidate.centerY > other.centerY + 0.06) {
          return false;
        }
        return true;
      });
      if (sidePanelNearPerson) {
        reject.add(candidate.index);
        continue;
      }
    }

    if (
      candidate.yaw >= 0.4 &&
      onSide &&
      meta.some(
        other =>
          other.index !== candidate.index &&
          other.yaw <= 0.35 &&
          other.area >= MIN_KEEP_FACE_AREA,
      )
    ) {
      reject.add(candidate.index);
      continue;
    }

    if (
      candidate.area >= 0.015 &&
      onSide &&
      meta.some(
        other =>
          other.index !== candidate.index &&
          other.area >= 0.0008 &&
          other.area < candidate.area * 0.85 &&
          Math.abs(other.centerX - 0.5) < Math.abs(candidate.centerX - 0.5),
      )
    ) {
      reject.add(candidate.index);
    }
  }

  if (reject.size === 0) {
    return faces;
  }
  return faces.filter((_, index) => !reject.has(index));
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
