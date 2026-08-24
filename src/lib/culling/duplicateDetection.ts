import {yieldToMain} from '@lib/async/yieldToMain';
import {CullingDuplicateGroup} from '@lib/culledAlbum/types';
import {Platform} from 'react-native';
import {
  arePhotosNearDuplicates,
  DUPLICATE_TEMPORAL_WINDOW_MS,
  DuplicateDetectionPhoto,
} from './cullingUtil';

const YIELD_EVERY_N_PHOTOS = Platform.OS === 'windows' ? 10 : 25;

export function photoQualityTier(
  photo: Pick<DuplicateDetectionPhoto, 'blurred' | 'closedEyes'>,
): number {
  if (photo.blurred) {
    return 0;
  }
  if (photo.closedEyes) {
    return 1;
  }
  return 2;
}

export function isDuplicateKeeperPhoto(
  photo: Pick<DuplicateDetectionPhoto, 'blurred' | 'closedEyes'>,
): boolean {
  return photoQualityTier(photo) >= 2;
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

export function compareDuplicateKeeperPreference<
  T extends Pick<
    DuplicateDetectionPhoto,
    'photoId' | 'fileName' | 'blurred' | 'closedEyes' | 'starRating' | 'capturedAt'
  >,
>(left: T, right: T): number {
  const tierDelta = photoQualityTier(left) - photoQualityTier(right);
  if (tierDelta !== 0) {
    return tierDelta;
  }

  const starDelta = (left.starRating ?? 0) - (right.starRating ?? 0);
  if (starDelta !== 0) {
    return starDelta;
  }

  const leftTime = left.capturedAt ?? Number.POSITIVE_INFINITY;
  const rightTime = right.capturedAt ?? Number.POSITIVE_INFINITY;
  if (leftTime !== rightTime) {
    return leftTime < rightTime ? 1 : -1;
  }

  const fileNameDelta = (left.fileName ?? '').localeCompare(
    right.fileName ?? '',
    undefined,
    {numeric: true, sensitivity: 'base'},
  );
  if (fileNameDelta !== 0) {
    return -fileNameDelta;
  }

  return -(left.photoId ?? '').localeCompare(right.photoId ?? '');
}

export function pickDuplicateGroupBestPhoto<
  T extends Pick<
    DuplicateDetectionPhoto,
    'photoId' | 'fileName' | 'blurred' | 'closedEyes' | 'starRating' | 'capturedAt'
  >,
>(groupPhotos: T[]): T {
  return groupPhotos.reduce((best, current) =>
    compareDuplicateKeeperPreference(best, current) >= 0 ? best : current,
  );
}

function collectNearDuplicateSets(
  sorted: DuplicateDetectionPhoto[],
): Set<string>[] {
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
  }

  return duplicateGroups;
}

function photoLabel(
  photoId: string,
  photoIdToRecord: Map<string, DuplicateDetectionPhoto>,
): string {
  return photoIdToRecord.get(photoId)?.fileName ?? photoId;
}

function logDuplicateGroups(
  groups: CullingDuplicateGroup[],
  photoIdToRecord: Map<string, DuplicateDetectionPhoto>,
): void {
  if (groups.length === 0) {
    console.log('[culling:duplicates] no groups');
    return;
  }

  console.log(`[culling:duplicates] ${groups.length} group(s)`);
  for (const group of groups) {
    const members = group.photoIds
      .map(id => {
        const label = photoLabel(id, photoIdToRecord);
        return id === group.bestPhotoId ? `*${label}` : label;
      })
      .join(', ');
    console.log(
      `[culling:duplicates] ${group.groupId} best=${photoLabel(
        group.bestPhotoId,
        photoIdToRecord,
      )} members=[${members}]`,
    );
  }
}

function finalizeDuplicateGroups(
  duplicateGroups: Set<string>[],
  photoIdToRecord: Map<string, DuplicateDetectionPhoto>,
): CullingDuplicateGroup[] {
  const persistedGroups: CullingDuplicateGroup[] = [];

  for (const group of duplicateGroups) {
    if (group.size <= 1) {
      continue;
    }

    const groupPhotos = Array.from(group)
      .map(id => photoIdToRecord.get(id)!)
      .filter(Boolean);

    const bestPhoto = pickDuplicateGroupBestPhoto(groupPhotos);

    for (const photo of groupPhotos) {
      photo.duplicated = photo.photoId !== bestPhoto.photoId;
    }

    persistedGroups.push({
      groupId: `dup-${bestPhoto.photoId}-${groupPhotos.length}`,
      photoIds: groupPhotos.map(photo => photo.photoId),
      bestPhotoId: bestPhoto.photoId,
    });
  }

  logDuplicateGroups(persistedGroups, photoIdToRecord);
  return persistedGroups;
}

export function detectDuplicates(
  photos: Record<string, DuplicateDetectionPhoto>,
): CullingDuplicateGroup[] {
  const records = Object.values(photos);
  for (const record of records) {
    record.duplicated = false;
  }
  if (records.length < 2) {
    return [];
  }

  const sorted = [...records].sort((a, b) => {
    const timeA = a.capturedAt ?? 0;
    const timeB = b.capturedAt ?? 0;
    return timeA - timeB;
  });

  const photoIdToRecord = new Map<string, DuplicateDetectionPhoto>();
  for (const record of sorted) {
    photoIdToRecord.set(record.photoId, record);
  }

  return finalizeDuplicateGroups(
    collectNearDuplicateSets(sorted),
    photoIdToRecord,
  );
}

export async function detectDuplicatesAsync(
  photos: Record<string, DuplicateDetectionPhoto>,
): Promise<CullingDuplicateGroup[]> {
  const records = Object.values(photos);
  for (const record of records) {
    record.duplicated = false;
  }
  if (records.length < 2) {
    return [];
  }

  const sorted = [...records].sort((a, b) => {
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

    if (i > 0 && i % YIELD_EVERY_N_PHOTOS === 0) {
      await yieldToMain();
    }
  }

  return finalizeDuplicateGroups(duplicateGroups, photoIdToRecord);
}
