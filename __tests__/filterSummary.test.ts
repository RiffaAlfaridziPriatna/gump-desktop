import {
  buildFilterSummary,
  formatStarRatings,
} from '../src/lib/culling/filterSummary';
import { CULL_FILTER_LABELS } from '../src/lib/culling/cullFilterLabels';

const none = {
  aiSelected: false,
  maybe: false,
  blurred: false,
  closedEyes: false,
  duplicated: false,
};

describe('formatStarRatings', () => {
  it.each([
    [[], null],
    [[4], '4 stars'],
    [[1], '1 star'],
    [[4, 5], '4-5 stars'],
    [[2, 3, 4], '2-4 stars'],
    [[1, 3], '1, 3 stars'],
    [[0], 'No rating'],
    [[3, 0], 'No rating, 3 stars'],
    [[0, 1, 2], 'No rating, 1-2 stars'],
  ] as const)('%j -> %s', (input, expected) => {
    expect(formatStarRatings(input)).toBe(expected);
  });
});

describe('buildFilterSummary', () => {
  it('has no labels without active filters', () => {
    expect(buildFilterSummary(none, null, [])).toEqual({
      labels: [],
      showSimilarNote: false,
    });
  });

  it('orders categories like the sidebar, then selection, then stars', () => {
    const s = buildFilterSummary(
      { ...none, duplicated: true, closedEyes: true },
      'unselected',
      [4, 5],
    );
    expect(s.labels).toEqual([
      CULL_FILTER_LABELS.closedEyes,
      CULL_FILTER_LABELS.duplicated,
      'Not picked',
      '4-5 stars',
    ]);
  });

  it('labels the picked selection', () => {
    expect(buildFilterSummary(none, 'selected', []).labels).toEqual(['Picked']);
  });

  it('shows the note only when Similar Shots joins another category', () => {
    expect(
      buildFilterSummary({ ...none, duplicated: true }, 'selected', [])
        .showSimilarNote,
    ).toBe(false);
    expect(
      buildFilterSummary({ ...none, blurred: true }, null, []).showSimilarNote,
    ).toBe(false);
    expect(
      buildFilterSummary({ ...none, duplicated: true, blurred: true }, null, [])
        .showSimilarNote,
    ).toBe(true);
  });
});
