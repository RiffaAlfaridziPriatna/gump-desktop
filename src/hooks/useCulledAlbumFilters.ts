import {
  matchesCulledAlbumGridFilters,
  SelectionFilter,
  StarRatingFilter,
} from '@lib/culling/culledAlbumPhotoFilters';
import {
  CullFilterKey,
  matchesCullFilterKey,
  normalizeCullFilters,
} from '@lib/culling/cullingUtil';
import {
  buildSimilarShotsLayout,
  toSimilarShotsSections,
  countGroupedPhotos,
} from '@lib/culling/similarShotsView';
import {useSimilarShotGroups} from '@hooks/useSimilarShotGroups';
import {CulledAlbumGridPhoto} from '@components/culling/CulledAlbumPhotoGrid';
import {APIResponse} from '@services/api';
import {useCallback, useMemo, useState} from 'react';

type FilterKey = CullFilterKey;

const FILTER_KEYS = Object.keys({
  aiSelected: true,
  maybe: true,
  blurred: true,
  closedEyes: true,
  duplicated: true,
}) as FilterKey[];

export function useCulledAlbumFilters(
  gridPhotos: CulledAlbumGridPhoto[],
  stats: APIResponse.CullingStats | null,
  savedFilters: Partial<Record<FilterKey, boolean>> | null | undefined,
  albumId: string,
) {
  const {orderedGroups, summaryFor} = useSimilarShotGroups(albumId);
  const [activeFilters, setActiveFilters] = useState<
    Record<FilterKey, boolean>
  >(() => normalizeCullFilters(savedFilters));
  const [selectionFilter, setSelectionFilter] = useState<SelectionFilter>(null);
  const [starRatingFilter, setStarRatingFilter] = useState<StarRatingFilter>(
    [],
  );

  const gridFilters = useMemo(
    () => ({
      selection: selectionFilter,
      starRating: starRatingFilter,
    }),
    [selectionFilter, starRatingFilter],
  );

  const layout = useMemo(
    () =>
      buildSimilarShotsLayout({
        photos: gridPhotos,
        orderedGroups,
        activeFilters,
        gridFilters,
      }),
    [activeFilters, gridFilters, gridPhotos, orderedGroups],
  );

  const flatPhotos = useMemo(() => {
    if (layout) {
      return [];
    }
    const enabledCullFilters = Object.entries(activeFilters).filter(
      ([, enabled]) => enabled,
    ) as Array<[FilterKey, boolean]>;
    const hasGridFilters =
      selectionFilter !== null || starRatingFilter.length > 0;

    return gridPhotos.filter(({analysis}) => {
      if (
        hasGridFilters &&
        !matchesCulledAlbumGridFilters(analysis, gridFilters)
      ) {
        return false;
      }
      if (enabledCullFilters.length === 0) {
        return true;
      }
      if (!analysis) {
        return false;
      }
      return enabledCullFilters.some(([key]) =>
        matchesCullFilterKey(analysis, key),
      );
    });
  }, [
    activeFilters,
    gridFilters,
    gridPhotos,
    layout,
    selectionFilter,
    starRatingFilter,
  ]);

  const filteredPhotos = layout ? layout.photos : flatPhotos;
  const sections = useMemo(
    () => (layout ? toSimilarShotsSections(layout, summaryFor) : undefined),
    [layout, summaryFor],
  );
  const gridView = useMemo(
    () => ({photos: filteredPhotos, sections}),
    [filteredPhotos, sections],
  );

  const selectedCount = useMemo(
    () =>
      stats?.mySelections ??
      gridPhotos.filter(photo => photo.analysis?.selected).length,
    [gridPhotos, stats],
  );

  const actionCount = filteredPhotos.length;

  const groupedCount = useMemo(
    () => countGroupedPhotos(orderedGroups),
    [orderedGroups],
  );

  const filterCounts = useMemo(() => {
    if (stats) {
      return {
        aiSelected: stats.aiSelected,
        maybe: stats.maybe,
        blurred: stats.blurred,
        closedEyes: stats.closedEyes,
        duplicated: groupedCount || stats.duplicated,
      } as Record<FilterKey, number>;
    }

    const counts = Object.fromEntries(
      FILTER_KEYS.map(key => [key, 0]),
    ) as Record<FilterKey, number>;

    for (const photo of gridPhotos) {
      if (!photo.analysis) {
        continue;
      }
      for (const key of FILTER_KEYS) {
        if (matchesCullFilterKey(photo.analysis, key)) {
          counts[key] += 1;
        }
      }
    }

    if (groupedCount > 0) {
      counts.duplicated = groupedCount;
    }
    return counts;
  }, [gridPhotos, groupedCount, stats]);

  const toggleFilter = useCallback((key: FilterKey) => {
    setActiveFilters(current => ({...current, [key]: !current[key]}));
  }, []);

  return {
    activeFilters,
    selectionFilter,
    starRatingFilter,
    filteredPhotos,
    gridView,
    actionPhotos: filteredPhotos,
    filterCounts,
    selectedCount,
    actionCount,
    toggleFilter,
    setSelectionFilter,
    setStarRatingFilter,
  };
}
