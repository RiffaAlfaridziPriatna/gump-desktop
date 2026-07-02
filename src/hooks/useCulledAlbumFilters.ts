import {
  matchesCulledAlbumGridFilters,
  SelectionFilter,
  StarRatingFilter,
} from '@lib/culling/culledAlbumPhotoFilters';
import {CullFilterKey, matchesCullFilterKey} from '@lib/culling/cullingUtil';
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
) {
  const [activeFilters, setActiveFilters] = useState<
    Record<FilterKey, boolean>
  >({
    aiSelected: false,
    maybe: false,
    blurred: false,
    closedEyes: false,
    duplicated: false,
  });
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

  const filteredPhotos = useMemo(() => {
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
    selectionFilter,
    starRatingFilter,
  ]);

  const selectedCount = useMemo(
    () =>
      stats?.mySelections ??
      gridPhotos.filter(photo => photo.analysis?.selected).length,
    [gridPhotos, stats],
  );

  const filterCounts = useMemo(() => {
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

    for (const key of FILTER_KEYS) {
      if (stats?.[key] !== undefined) {
        counts[key] = stats[key] as number;
      }
    }

    return counts;
  }, [gridPhotos, stats]);

  const toggleFilter = useCallback((key: FilterKey) => {
    setActiveFilters(current => ({...current, [key]: !current[key]}));
  }, []);

  return {
    activeFilters,
    selectionFilter,
    starRatingFilter,
    filteredPhotos,
    filterCounts,
    selectedCount,
    toggleFilter,
    setSelectionFilter,
    setStarRatingFilter,
  };
}
