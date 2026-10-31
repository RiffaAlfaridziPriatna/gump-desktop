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

type ViewPhoto = {photoId: string; analysis?: APIResponse.CullingPhoto};

/** Section structure and shown photos; no header text, so picks do not touch it. */
export type SimilarShotsLayout<T extends ViewPhoto> = {
  groups: {groupNumber: number; photoIds: string[]}[];
  otherIds: string[];
  /** Shown photos in grid order. */
  photos: T[];
};

type RawFlagKey = Exclude<CullFilterKey, 'duplicated'>;

export type SimilarShotsLayoutInput<T extends ViewPhoto> = {
  photos: readonly T[];
  orderedGroups: readonly CullingDuplicateGroup[];
  activeFilters: Record<CullFilterKey, boolean>;
  gridFilters: CulledAlbumGridFilters;
};

/** Sidebar count: every member of every group, derived from the groups. */
export function countGroupedPhotos(
  orderedGroups: readonly CullingDuplicateGroup[],
): number {
  return orderedGroups.reduce((sum, group) => sum + group.photoIds.length, 0);
}

/**
 * Grouped Similar Shots layout, or null when the flat list applies (filter
 * off or no stored groups). Members match another category by their raw flag;
 * ungrouped photos keep the flat-list category semantics. A photo stored in
 * two groups is shown once, in the first.
 */
export function buildSimilarShotsLayout<T extends ViewPhoto>({
  photos,
  orderedGroups,
  activeFilters,
  gridFilters,
}: SimilarShotsLayoutInput<T>): SimilarShotsLayout<T> | null {
  if (!activeFilters.duplicated || orderedGroups.length === 0) {
    return null;
  }
  const otherKeys = (Object.keys(activeFilters) as CullFilterKey[]).filter(
    key => key !== 'duplicated' && activeFilters[key],
  );
  const byId = new Map(photos.map(photo => [photo.photoId, photo]));
  const shown: T[] = [];
  const emitted = new Set<string>();

  const memberMatches = (photoId: string) => {
    const photo = byId.get(photoId);
    if (
      !photo ||
      emitted.has(photoId) ||
      !matchesCulledAlbumGridFilters(photo.analysis, gridFilters)
    ) {
      return false;
    }
    const analysis = photo.analysis;
    if (
      otherKeys.length > 0 &&
      !otherKeys.some(key => Boolean(analysis?.[key as RawFlagKey]))
    ) {
      return false;
    }
    emitted.add(photoId);
    shown.push(photo);
    return true;
  };

  const groups = buildSimilarShotSections(orderedGroups, memberMatches).flatMap(
    section =>
      section.kind === 'group'
        ? [{groupNumber: section.groupNumber, photoIds: section.photoIds}]
        : [],
  );

  const otherIds: string[] = [];
  if (otherKeys.length > 0) {
    const grouped = indexGroupsByPhotoId(orderedGroups);
    for (const photo of photos) {
      const {photoId, analysis} = photo;
      if (
        analysis !== undefined &&
        !grouped.has(photoId) &&
        matchesCulledAlbumGridFilters(analysis, gridFilters) &&
        otherKeys.some(key => matchesCullFilterKey(analysis, key))
      ) {
        otherIds.push(photoId);
        shown.push(photo);
      }
    }
  }
  return {groups, otherIds, photos: shown};
}

/** Header text comes from live summaries; keys depend only on the layout. */
export function toSimilarShotsSections(
  layout: Pick<SimilarShotsLayout<ViewPhoto>, 'groups' | 'otherIds'>,
  summaryFor: (groupIndex: number) => SimilarShotGroupSummary | undefined,
): SimilarShotsViewSection[] {
  const sections: SimilarShotsViewSection[] = layout.groups.map(
    ({groupNumber, photoIds}) => {
      const summary = summaryFor(groupNumber - 1);
      return {
        key: `group-${groupNumber}`,
        title: `Group ${groupNumber}`,
        subtitle: summary
          ? `${summary.shotCount} shots · ${summary.pickedCount} picked`
          : undefined,
        isGroup: true,
        photoIds,
      };
    },
  );
  if (layout.otherIds.length > 0) {
    sections.push({
      key: 'other',
      title: 'Other matching photos',
      photoIds: layout.otherIds,
    });
  }
  return sections;
}
