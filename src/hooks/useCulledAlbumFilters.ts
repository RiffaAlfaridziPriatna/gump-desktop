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
  reuseSections,
  type SimilarShotsViewSection,
} from '@lib/culling/similarShotsView';
import {useSimilarShotGroups} from '@hooks/useSimilarShotGroups';
import {CulledAlbumGridPhoto} from '@components/culling/CulledAlbumPhotoGrid';
import {APIResponse} from '@services/api';
import {useCallback, useMemo, useRef, useState} from 'react';

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
  const {orderedGroups, groupIndexByPhotoId, summaryFor} =
    useSimilarShotGroups(albumId);
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
  // summaryFor changes on every photo write; keep sections (and the grid's
  // renderRow) stable unless the header text or structure really changed.
  const sectionsRef = useRef<SimilarShotsViewSection[] | undefined>(undefined);
  const sections = useMemo(
    () =>
      reuseSections(
        sectionsRef.current,
        layout ? toSimilarShotsSections(layout, summaryFor) : undefined,
      ),
    [layout, summaryFor],
  );
  sectionsRef.current = sections;
  // Badge only in the flat grid; the grouped view shows the count in its header.
  // orderedGroups is already live-filtered, so its length equals summaryFor's
  // shotCount, but stays stable across pick toggles (summaryFor does not).
  const getSimilarShotCount = useMemo(() => {
    if (layout) {
      return undefined;
    }
    return (photoId: string) => {
      const groupIndex = groupIndexByPhotoId.get(photoId);
      return groupIndex === undefined
        ? undefined
        : orderedGroups[groupIndex]?.photoIds.length;
    };
  }, [groupIndexByPhotoId, layout, orderedGroups]);
  const gridView = useMemo(
    () => ({photos: filteredPhotos, sections, getSimilarShotCount}),
    [filteredPhotos, sections, getSimilarShotCount],
  );

  const hasActiveFilter =
    selectionFilter !== null ||
    starRatingFilter.length > 0 ||
    Object.values(activeFilters).some(Boolean);

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
    filterCounts,
    hasActiveFilter,
    toggleFilter,
    setSelectionFilter,
    setStarRatingFilter,
  };
}
