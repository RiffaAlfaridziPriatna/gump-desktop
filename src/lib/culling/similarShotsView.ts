import {
  matchesCulledAlbumGridFilters,
  type CulledAlbumGridFilters,
} from '@lib/culling/culledAlbumPhotoFilters';
import {
  matchesCullFilterKey,
  type CullFilterKey,
} from '@lib/culling/cullingUtil';
import {
  buildSimilarShotSections,
  indexGroupsByPhotoId,
  type SimilarShotGroupSummary,
} from '@lib/culling/similarShotGroups';
import type {CullingDuplicateGroup} from '@lib/culledAlbum/types';
import type {APIResponse} from '@services/api';

export type SimilarShotsViewSection = {
  key: string;
  title: string;
  subtitle?: string;
  isGroup?: boolean;
  photoIds: string[];
};

export type SimilarShotsView = {
  sections: SimilarShotsViewSection[];
  /** Shown photo ids in grid order. */
  photoIds: string[];
  groupCount: number;
};

type ViewPhoto = {photoId: string; analysis?: APIResponse.CullingPhoto};

export type SimilarShotsViewInput = {
  photos: readonly ViewPhoto[];
  orderedGroups: readonly CullingDuplicateGroup[];
  activeFilters: Record<CullFilterKey, boolean>;
  gridFilters: CulledAlbumGridFilters;
  /** Live header counts for the group at this ordered index. */
  summaryFor: (groupIndex: number) => SimilarShotGroupSummary | undefined;
};

/** Sidebar count: every member of every group, derived from the groups. */
export function countGroupedPhotos(
  orderedGroups: readonly CullingDuplicateGroup[],
): number {
  return orderedGroups.reduce((sum, group) => sum + group.photoIds.length, 0);
}

/**
 * Grouped Similar Shots view, or null when the flat list applies (filter off
 * or no stored groups). Members match another category by their raw flag;
 * ungrouped photos keep the flat-list category semantics.
 */
export function buildSimilarShotsView({
  photos,
  orderedGroups,
  activeFilters,
  gridFilters,
  summaryFor,
}: SimilarShotsViewInput): SimilarShotsView | null {
  if (!activeFilters.duplicated || orderedGroups.length === 0) {
    return null;
  }
  const otherKeys = (Object.keys(activeFilters) as CullFilterKey[]).filter(
    key => key !== 'duplicated' && activeFilters[key],
  );
  const byId = new Map(photos.map(photo => [photo.photoId, photo]));
  const passesGrid = (photo: ViewPhoto) =>
    matchesCulledAlbumGridFilters(photo.analysis, gridFilters);

  const memberMatches = (photoId: string) => {
    const photo = byId.get(photoId);
    if (!photo || !passesGrid(photo)) {
      return false;
    }
    const analysis = photo.analysis;
    return (
      otherKeys.length === 0 ||
      otherKeys.some(key => key !== 'duplicated' && Boolean(analysis?.[key]))
    );
  };

  const sections: SimilarShotsViewSection[] = buildSimilarShotSections(
    orderedGroups,
    memberMatches,
  ).flatMap(section => {
    if (section.kind !== 'group') {
      return [];
    }
    const summary = summaryFor(section.groupNumber - 1);
    return [
      {
        key: `group-${section.groupNumber}`,
        title: `Group ${section.groupNumber}`,
        subtitle: summary
          ? `${summary.shotCount} shots · ${summary.pickedCount} picked`
          : undefined,
        isGroup: true,
        photoIds: section.photoIds,
      },
    ];
  });
  const groupCount = sections.length;

  if (otherKeys.length > 0) {
    const grouped = indexGroupsByPhotoId(orderedGroups);
    const photoIds = photos
      .filter(({photoId, analysis}) => {
        return (
          analysis !== undefined &&
          !grouped.has(photoId) &&
          matchesCulledAlbumGridFilters(analysis, gridFilters) &&
          otherKeys.some(key => matchesCullFilterKey(analysis, key))
        );
      })
      .map(photo => photo.photoId);
    if (photoIds.length > 0) {
      sections.push({key: 'other', title: 'Other matching photos', photoIds});
    }
  }

  return {
    sections,
    photoIds: sections.flatMap(section => section.photoIds),
    groupCount,
  };
}
