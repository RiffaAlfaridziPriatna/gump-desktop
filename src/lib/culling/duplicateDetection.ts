import {yieldToMain} from '@lib/async/yieldToMain';
import {
  arePhotosNearDuplicates,
  DUPLICATE_TEMPORAL_WINDOW_MS,
  DuplicateDetectionPhoto,
} from './cullingUtil';

const YIELD_EVERY_N_PHOTOS = 25;

function photoQualityTier(photo: DuplicateDetectionPhoto): number {
  if (photo.blurred) {
    return 0;
  }
  if (photo.closedEyes) {
    return 1;
  }
  return 2;
}

function mergeIntoDuplicateGroup(
  photoAId: string,
  photoBId: string,
  duplicateGroups: Set<string>[],
  photoIdToGroupIndex: Map<string, number>,
): void {
  const groupIndexA = photoIdToGroupIndex.get(photoAId);
  const groupIndexB = photoIdToGroupIndex.get(photoBId);

  if (groupIndexA !== undefined && groupIndexB !== undefined) {
    if (groupIndexA !== groupIndexB) {
      const groupA = duplicateGroups[groupIndexA]!;
      const groupB = duplicateGroups[groupIndexB]!;
      for (const id of groupB) {
        groupA.add(id);
        photoIdToGroupIndex.set(id, groupIndexA);
      }
      groupB.clear();
    }
  } else if (groupIndexA !== undefined) {
    duplicateGroups[groupIndexA]!.add(photoBId);
    photoIdToGroupIndex.set(photoBId, groupIndexA);
  } else if (groupIndexB !== undefined) {
    duplicateGroups[groupIndexB]!.add(photoAId);
    photoIdToGroupIndex.set(photoAId, groupIndexB);
  } else {
    const newGroup = new Set([photoAId, photoBId]);
    const newIndex = duplicateGroups.length;
    duplicateGroups.push(newGroup);
    photoIdToGroupIndex.set(photoAId, newIndex);
    photoIdToGroupIndex.set(photoBId, newIndex);
  }
}

export function detectDuplicates(
  photos: Record<string, DuplicateDetectionPhoto>,
): void {
  runDuplicateDetection(photos);
}

export async function detectDuplicatesAsync(
  photos: Record<string, DuplicateDetectionPhoto>,
): Promise<void> {
  await runDuplicateDetection(photos, true);
}

async function runDuplicateDetection(
  photos: Record<string, DuplicateDetectionPhoto>,
  yieldBetweenChunks = false,
): Promise<void> {
  const records = Object.values(photos);

  for (const record of records) {
    record.duplicated = false;
  }

  if (records.length < 2) {
    return;
  }

  const sorted = records.sort((a, b) => {
    const timeA = a.capturedAt ?? 0;
    const timeB = b.capturedAt ?? 0;
    return timeA - timeB;
  });

  const photoIdToRecord = new Map<string, DuplicateDetectionPhoto>();
  for (const record of sorted) {
    photoIdToRecord.set(record.photoId, record);
  }

  const duplicateGroups: Set<string>[] = [];
  const photoIdToGroupIndex = new Map<string, number>();

  const processed: DuplicateDetectionPhoto[] = [];
  let windowStart = 0;

  for (let i = 0; i < sorted.length; i++) {
    const photoA = sorted[i]!;
    const aTime = photoA.capturedAt ?? 0;

    while (windowStart < processed.length) {
      const candidate = processed[windowStart]!;
      const candidateTime = candidate.capturedAt ?? 0;
      if (aTime - candidateTime <= DUPLICATE_TEMPORAL_WINDOW_MS) {
        break;
      }
      windowStart++;
    }

    // Only photos within the burst / near-duplicate capture window.
    for (let p = windowStart; p < processed.length; p++) {
      const photoB = processed[p]!;
      if (!arePhotosNearDuplicates(photoA, photoB)) {
        continue;
      }
      mergeIntoDuplicateGroup(
        photoA.photoId,
        photoB.photoId,
        duplicateGroups,
        photoIdToGroupIndex,
      );
    }

    processed.push(photoA);

    if (yieldBetweenChunks && i > 0 && i % YIELD_EVERY_N_PHOTOS === 0) {
      await yieldToMain();
    }
  }

  for (let groupIndex = 0; groupIndex < duplicateGroups.length; groupIndex++) {
    const group = duplicateGroups[groupIndex]!;
    if (group.size <= 1) {
      continue;
    }

    const groupPhotos = Array.from(group)
      .map(id => photoIdToRecord.get(id)!)
      .filter(Boolean);

    const bestPhoto = groupPhotos.reduce((best, current) => {
      const bestTier = photoQualityTier(best);
      const currentTier = photoQualityTier(current);
      if (currentTier !== bestTier) {
        return currentTier > bestTier ? current : best;
      }
      return (current.starRating ?? 0) > (best.starRating ?? 0) ? current : best;
    });

    for (const photo of groupPhotos) {
      photo.duplicated = photo.photoId !== bestPhoto.photoId;
    }

    if (
      yieldBetweenChunks &&
      groupIndex > 0 &&
      groupIndex % YIELD_EVERY_N_PHOTOS === 0
    ) {
      await yieldToMain();
    }
  }
}
