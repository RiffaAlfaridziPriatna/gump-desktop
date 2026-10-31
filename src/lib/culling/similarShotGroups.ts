import type {
  CulledAlbumPhoto,
  CullingDuplicateGroup,
} from '@lib/culledAlbum/types';

export type SimilarShotPhoto = Pick<
  CulledAlbumPhoto,
  'photoId' | 'capturedAt' | 'file' | 'selected'
>;

export type SimilarShotGroupSummary = {
  shotCount: number;
  pickedCount: number;
};

/**
 * Grouped-view model. `groupNumber` is the 1-based position in the ordered
 * group list, so it stays stable when earlier groups are hidden by filters.
 * `group` is the full live group (header counts come from it); `photoIds`
 * are the members to render. `other` is appended by the caller for matching
 * photos that belong to no group.
 */
export type SimilarShotSection =
  | {
      kind: 'group';
      groupNumber: number;
      group: CullingDuplicateGroup;
      photoIds: string[];
    }
  | { kind: 'other'; photoIds: string[] };

export function indexGroupsByPhotoId(
  groups: readonly CullingDuplicateGroup[] | undefined,
): Map<string, number> {
  const index = new Map<string, number>();
  groups?.forEach((group, groupIndex) => {
    for (const photoId of group.photoIds) {
      index.set(photoId, groupIndex);
    }
  });
  return index;
}

// Null capturedAt sorts last, matching duplicateDetection.
function captureTime(photo: SimilarShotPhoto): number {
  return photo.capturedAt ?? Number.POSITIVE_INFINITY;
}

function compareMembers(left: SimilarShotPhoto, right: SimilarShotPhoto) {
  const timeDelta = captureTime(left) - captureTime(right);
  if (timeDelta !== 0 && !Number.isNaN(timeDelta)) {
    return timeDelta;
  }
  const nameDelta = left.file.name.localeCompare(right.file.name, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
  if (nameDelta !== 0) {
    return nameDelta;
  }
  return left.photoId.localeCompare(right.photoId);
}

export function orderSimilarShotGroups(
  groups: readonly CullingDuplicateGroup[] | undefined,
  photosById: ReadonlyMap<string, SimilarShotPhoto>,
): CullingDuplicateGroup[] {
  if (!groups) {
    return [];
  }
  const live: { group: CullingDuplicateGroup; first: SimilarShotPhoto }[] = [];
  for (const group of groups) {
    const members = group.photoIds
      .map(photoId => photosById.get(photoId))
      .filter((photo): photo is SimilarShotPhoto => Boolean(photo))
      .sort(compareMembers);
    if (members.length < 2) {
      continue;
    }
    live.push({
      group: { ...group, photoIds: members.map(photo => photo.photoId) },
      first: members[0]!,
    });
  }
  return live
    .sort((left, right) => compareMembers(left.first, right.first))
    .map(entry => entry.group);
}

export function summarizeGroup(
  group: CullingDuplicateGroup,
  photosById: ReadonlyMap<string, SimilarShotPhoto>,
): SimilarShotGroupSummary {
  let shotCount = 0;
  let pickedCount = 0;
  for (const photoId of group.photoIds) {
    const photo = photosById.get(photoId);
    if (!photo) {
      continue;
    }
    shotCount += 1;
    if (photo.selected) {
      pickedCount += 1;
    }
  }
  return { shotCount, pickedCount };
}

/**
 * `orderedGroups` must come from `orderSimilarShotGroups`. Without
 * `matchesOtherFilters` (Similar Shots alone) every member is kept; with it,
 * members are filtered and groups left empty are hidden.
 */
export function buildSimilarShotSections(
  orderedGroups: readonly CullingDuplicateGroup[],
  matchesOtherFilters?: (photoId: string) => boolean,
): SimilarShotSection[] {
  const sections: SimilarShotSection[] = [];
  orderedGroups.forEach((group, index) => {
    const photoIds = matchesOtherFilters
      ? group.photoIds.filter(matchesOtherFilters)
      : group.photoIds;
    if (photoIds.length === 0) {
      return;
    }
    sections.push({ kind: 'group', groupNumber: index + 1, group, photoIds });
  });
  return sections;
}
