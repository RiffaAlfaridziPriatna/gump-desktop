import {APIResponse} from '@services/api';

export type SelectionFilter = 'selected' | 'unselected' | null;
export type StarRating = 0 | 1 | 2 | 3 | 4 | 5;
export type StarRatingFilter = ReadonlyArray<StarRating>;

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

  if (filters.starRating.length > 0) {
    const rating = analysis.starRating ?? 0;
    if (!filters.starRating.includes(rating as StarRating)) {
      return false;
    }
  }

  return true;
}
