export type SubjectFaceBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type SubjectSelectableFace = {
  boundingBox: SubjectFaceBox;
  sharpness?: number | null;
  pose?: {yaw?: number | null} | null;
};

/**
 * Max larger/smaller face-area ratio still treated as the same subject tier.
 * Group-photo faces are typically within ~2x; background faces are often 4x+ smaller.
 */
export const SUBJECT_FACE_MAX_AREA_RATIO = 2.4;

/**
 * Soft spatial gate: keep faces whose center is within this many median
 * absolute-deviations of the cluster centroid (Y weighted more via band).
 */
export const SUBJECT_FACE_SPATIAL_MAD_FACTOR = 3.25;

/**
 * Soft sharpness gate vs cluster median. Soft posters / screen faces usually
 * sit well below real subjects even when their bounding boxes look similar.
 */
export const SUBJECT_FACE_MIN_SHARPNESS_RATIO = 0.48;

/**
 * Drop faces that are soft relative to the sharpest peer in the tier
 * (print/screen faces near subjects). Absolute ceiling avoids dropping a
 * legitimately soft group member when the whole group is soft.
 */
export const SUBJECT_FACE_MAX_RELATIVE_SHARPNESS = 0.45;
export const SUBJECT_FACE_SOFT_ABSOLUTE_CEILING = 50;

/**
 * Profile / screen faces often have extreme yaw vs frontal subjects.
 */
export const SUBJECT_FACE_PRINT_YAW_DEGREES = 28;
export const SUBJECT_FACE_PRINT_YAW_SHARPNESS_RATIO = 0.72;

/**
 * Clear foreground subject vs a midground pack of smaller faces.
 * (Not the same as an edge photobomb that is 4x+ larger than a posed group.)
 */
export const SUBJECT_FOREGROUND_AREA_RATIO = 1.55;
export const SUBJECT_FOREGROUND_SHARPNESS_RATIO = 0.8;
export const SUBJECT_PHOTOBOMB_AREA_RATIO = 3.5;

type FaceMetrics<T extends SubjectSelectableFace> = {
  face: T;
  index: number;
  area: number;
  cx: number;
  cy: number;
  sharpness: number;
  yaw: number;
};

function faceArea(box: SubjectFaceBox): number {
  return Math.max(0, box.width) * Math.max(0, box.height);
}

function areasAreSimilar(areaA: number, areaB: number): boolean {
  const minArea = Math.min(areaA, areaB);
  const maxArea = Math.max(areaA, areaB);
  if (minArea <= 1e-12) {
    return false;
  }
  return maxArea / minArea <= SUBJECT_FACE_MAX_AREA_RATIO;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function medianAbsoluteDeviation(values: number[], center: number): number {
  if (values.length === 0) {
    return 0;
  }
  return median(values.map(value => Math.abs(value - center)));
}

function peerGroupForSeed<T extends SubjectSelectableFace>(
  metrics: FaceMetrics<T>[],
  seed: FaceMetrics<T>,
): FaceMetrics<T>[] {
  return metrics.filter(candidate =>
    areasAreSimilar(candidate.area, seed.area),
  );
}

function prominenceScore<T extends SubjectSelectableFace>(
  item: FaceMetrics<T>,
): number {
  return item.area * (0.35 + 0.65 * (item.sharpness / 100));
}

function groupScore<T extends SubjectSelectableFace>(
  group: FaceMetrics<T>[],
): number {
  // Prefer dense same-size tiers, but do not let headcount alone crush a
  // clear foreground subject (sqrt dampens length vs previous linear *n).
  const totalArea = group.reduce((sum, item) => sum + item.area, 0);
  const meanSharpness =
    group.reduce((sum, item) => sum + item.sharpness, 0) /
    Math.max(group.length, 1);
  return (
    totalArea *
    Math.sqrt(group.length) *
    (0.5 + 0.5 * (meanSharpness / 100))
  );
}

function isNearFrameEdge<T extends SubjectSelectableFace>(
  item: FaceMetrics<T>,
): boolean {
  const box = item.face.boundingBox;
  return (
    box.left < 0.08 ||
    box.top < 0.06 ||
    box.left + box.width > 0.92 ||
    box.top + box.height > 0.94 ||
    item.cx < 0.16 ||
    item.cx > 0.84
  );
}

function pickSubjectGroup<T extends SubjectSelectableFace>(
  metrics: FaceMetrics<T>[],
  denseMultiGroup: FaceMetrics<T>[] | null,
  fallbackGroup: FaceMetrics<T>[],
): FaceMetrics<T>[] {
  let primary = metrics[0]!;
  let bestProminence = prominenceScore(primary);
  for (let i = 1; i < metrics.length; i++) {
    const candidate = metrics[i]!;
    const score = prominenceScore(candidate);
    if (score > bestProminence) {
      primary = candidate;
      bestProminence = score;
    }
  }

  if (!denseMultiGroup || denseMultiGroup.length < 2) {
    return fallbackGroup;
  }

  if (denseMultiGroup.some(item => item.index === primary.index)) {
    return denseMultiGroup;
  }

  const denseMedianArea = median(denseMultiGroup.map(item => item.area));
  const denseMedianSharpness = median(
    denseMultiGroup.map(item => item.sharpness),
  );
  const denseBestProminence = Math.max(
    ...denseMultiGroup.map(item => prominenceScore(item)),
  );
  const primaryPeers = peerGroupForSeed(metrics, primary);

  // Edge / absurdly large outlier vs a posed group → keep the group.
  if (
    primary.area >= denseMedianArea * SUBJECT_PHOTOBOMB_AREA_RATIO &&
    isNearFrameEdge(primary)
  ) {
    return denseMultiGroup;
  }

  const isClearForeground =
    primary.area >= denseMedianArea * SUBJECT_FOREGROUND_AREA_RATIO &&
    primary.sharpness >=
      denseMedianSharpness * SUBJECT_FOREGROUND_SHARPNESS_RATIO &&
    primary.sharpness >= 45;

  const isProminenceWinner =
    bestProminence >= denseBestProminence * 1.2 &&
    primary.area >= denseMedianArea * 1.35 &&
    primary.sharpness >= 45;

  if (isClearForeground || isProminenceWinner) {
    return primaryPeers;
  }

  return denseMultiGroup;
}

function refineSpatially<T extends SubjectSelectableFace>(
  group: FaceMetrics<T>[],
): FaceMetrics<T>[] {
  if (group.length <= 2) {
    return group;
  }

  const centerX = median(group.map(item => item.cx));
  const centerY = median(group.map(item => item.cy));
  const madX = medianAbsoluteDeviation(
    group.map(item => item.cx),
    centerX,
  );
  const madY = medianAbsoluteDeviation(
    group.map(item => item.cy),
    centerY,
  );

  // Fallback spread from face size when everyone is nearly co-located.
  const medianWidth = median(group.map(item => item.face.boundingBox.width));
  const medianHeight = median(group.map(item => item.face.boundingBox.height));
  let limitX = Math.max(
    madX * SUBJECT_FACE_SPATIAL_MAD_FACTOR,
    medianWidth * 2.5,
  );
  const limitY = Math.max(
    madY * SUBJECT_FACE_SPATIAL_MAD_FACTOR,
    medianHeight * 1.75,
  );

  const sameRow = madY <= medianHeight * 0.55;
  if (sameRow && group.length >= 3) {
    const sortedX = [...group].sort((left, right) => left.cx - right.cx);
    const gaps: number[] = [];
    for (let i = 1; i < sortedX.length; i++) {
      gaps.push(sortedX[i]!.cx - sortedX[i - 1]!.cx);
    }
    const medianGap = median(gaps);
    limitX = Math.max(limitX, medianGap * 2.75, medianWidth * 4);
  }

  const spatiallyKept = group.filter(
    item =>
      Math.abs(item.cx - centerX) <= limitX &&
      Math.abs(item.cy - centerY) <= limitY,
  );

  return spatiallyKept.length > 0 ? spatiallyKept : group;
}

function refineBySharpness<T extends SubjectSelectableFace>(
  group: FaceMetrics<T>[],
): FaceMetrics<T>[] {
  if (group.length < 2) {
    return group;
  }

  const sharpnessValues = group.map(item => item.sharpness);
  const medianSharpness = median(sharpnessValues);
  const maxSharpness = Math.max(...sharpnessValues);
  if (medianSharpness < 20 && maxSharpness < 40) {
    return group;
  }

  const medianFloor = medianSharpness * SUBJECT_FACE_MIN_SHARPNESS_RATIO;
  const maxFloor = maxSharpness * SUBJECT_FACE_MAX_RELATIVE_SHARPNESS;

  const kept = group.filter(item => {
    if (item.sharpness < medianFloor) {
      return false;
    }
    // Soft relative to a clearly sharp peer → likely print/screen face.
    if (
      maxSharpness >= 55 &&
      item.sharpness < maxFloor &&
      item.sharpness < SUBJECT_FACE_SOFT_ABSOLUTE_CEILING
    ) {
      return false;
    }
    return true;
  });

  // Never collapse a group photo to almost nothing from sharpness alone.
  if (kept.length < Math.max(1, Math.ceil(group.length * 0.35))) {
    return group;
  }
  return kept;
}

function refinePrintLikeFaces<T extends SubjectSelectableFace>(
  group: FaceMetrics<T>[],
): FaceMetrics<T>[] {
  if (group.length < 2) {
    return group;
  }

  const medianSharpness = median(group.map(item => item.sharpness));
  const hasFrontalSharpPeer = group.some(
    item =>
      Math.abs(item.yaw) < 18 &&
      item.sharpness >= medianSharpness * 0.9 &&
      item.sharpness >= 50,
  );
  if (!hasFrontalSharpPeer || medianSharpness < 40) {
    return group;
  }

  const yawFloor = medianSharpness * SUBJECT_FACE_PRINT_YAW_SHARPNESS_RATIO;
  const kept = group.filter(item => {
    if (
      Math.abs(item.yaw) >= SUBJECT_FACE_PRINT_YAW_DEGREES &&
      item.sharpness < yawFloor
    ) {
      return false;
    }
    return true;
  });

  if (kept.length < Math.max(1, Math.ceil(group.length * 0.35))) {
    return group;
  }
  return kept;
}

/**
 * Keep the dominant subject face cluster for Key Faces / photo quality flags.
 *
 * - Group photos: many similar-sized, co-located faces → keep all of them
 * - Candid foreground: large sharp subject wins over a midground pack
 * - Photobomb close-up: densest same-size tier wins over a single huge edge outlier
 * - Soft print/screen faces near subjects: dropped via relative sharpness / yaw
 */
export function selectDominantFaceCluster<T extends SubjectSelectableFace>(
  faces: T[],
): T[] {
  if (faces.length <= 1) {
    return faces;
  }

  const metrics: FaceMetrics<T>[] = faces.map((face, index) => {
    const area = faceArea(face.boundingBox);
    return {
      face,
      index,
      area,
      cx: face.boundingBox.left + face.boundingBox.width * 0.5,
      cy: face.boundingBox.top + face.boundingBox.height * 0.5,
      sharpness: face.sharpness ?? 0,
      yaw: face.pose?.yaw ?? 0,
    };
  });

  let bestGroup = peerGroupForSeed(metrics, metrics[0]!);
  let bestScore = groupScore(bestGroup);
  let bestMultiGroup: FaceMetrics<T>[] | null =
    bestGroup.length >= 2 ? bestGroup : null;
  let bestMultiScore = bestMultiGroup ? bestScore : -1;

  for (let i = 1; i < metrics.length; i++) {
    const candidateGroup = peerGroupForSeed(metrics, metrics[i]!);
    const score = groupScore(candidateGroup);
    if (
      score > bestScore ||
      (Math.abs(score - bestScore) < 1e-12 &&
        candidateGroup.length > bestGroup.length)
    ) {
      bestGroup = candidateGroup;
      bestScore = score;
    }
    if (candidateGroup.length >= 2) {
      if (
        score > bestMultiScore ||
        (Math.abs(score - bestMultiScore) < 1e-12 &&
          candidateGroup.length > (bestMultiGroup?.length ?? 0))
      ) {
        bestMultiGroup = candidateGroup;
        bestMultiScore = score;
      }
    }
  }

  const subjectGroup = pickSubjectGroup(metrics, bestMultiGroup, bestGroup);
  const spatiallyRefined = refineSpatially(subjectGroup);
  const sharpnessRefined = refineBySharpness(spatiallyRefined);
  const printRefined = refinePrintLikeFaces(sharpnessRefined);

  return printRefined
    .sort((left, right) => left.index - right.index)
    .map(item => item.face);
}
