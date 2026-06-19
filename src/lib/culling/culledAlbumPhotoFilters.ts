import {APIResponse} from '@services/api';

export type SelectionFilter = 'selected' | 'unselected' | null;
export type StarRatingFilter = 0 | 1 | 2 | 3 | 4 | 5 | null;

export type CulledAlbumGridFilters = {
  selection: SelectionFilter;
  starRating: StarRatingFilter;
};

export function matchesCulledAlbumGridFilters(
  analysis: APIResponse.CullingPhoto | undefined,
  filters: CulledAlbumGridFilters,
): boolean {
  if (!analysis) {
    return false;
  }

  if (filters.selection === 'selected' && !analysis.selected) {
    return false;
  }
  if (filters.selection === 'unselected' && analysis.selected) {
    return false;
  }

  if (filters.starRating !== null) {
    const rating = analysis.starRating ?? 0;
    if (rating !== filters.starRating) {
      return false;
    }
  }

  return true;
}
