import {CULL_FILTER_LABELS, CULL_FILTER_ORDER} from './cullFilterLabels';
import type {CullFilterKey} from './cullingUtil';
import type {SelectionFilter, StarRatingFilter} from './culledAlbumPhotoFilters';

export type FilterSummary = {
  labels: string[];
  showSimilarNote: boolean;
};

export function formatStarRatings(ratings: StarRatingFilter): string | null {
  const sorted = [...new Set(ratings)].sort((a, b) => a - b);
  const stars = sorted.filter(rating => rating > 0);
  const parts: string[] = [];
  if (sorted.length > stars.length) {
    parts.push('No rating');
  }
  if (stars.length > 0) {
    const first = stars[0];
    const last = stars[stars.length - 1];
    const isRun = stars.length > 1 && last - first === stars.length - 1;
    const text = isRun ? `${first}-${last}` : stars.join(', ');
    const unit = stars.length === 1 && first === 1 ? 'star' : 'stars';
    parts.push(`${text} ${unit}`);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

/** Labels follow the sidebar order: categories, then selection, then stars. */
export function buildFilterSummary(
  activeFilters: Record<CullFilterKey, boolean>,
  selectionFilter: SelectionFilter,
  starRatingFilter: StarRatingFilter,
): FilterSummary {
  const categories = CULL_FILTER_ORDER.filter(key => activeFilters[key]);
  const labels = categories.map(key => CULL_FILTER_LABELS[key]);
  if (selectionFilter) {
    labels.push(selectionFilter === 'selected' ? 'Picked' : 'Not picked');
  }
  const stars = formatStarRatings(starRatingFilter);
  if (stars) {
    labels.push(stars);
  }
  return {
    labels,
    showSimilarNote: categories.length > 1 && activeFilters.duplicated,
  };
}
