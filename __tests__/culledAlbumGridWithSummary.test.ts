jest.mock('../src/components/culling/CulledAlbumPhotoGrid', () => ({
  CulledAlbumPhotoGrid: () => null,
}));

import { summarizeSections } from '../src/components/culling/CulledAlbumGridWithSummary';

const group = (key: string, n: number) => ({
  key,
  title: key,
  isGroup: true,
  photoIds: Array.from({ length: n }, (_, i) => `${key}${i}`),
});

describe('summarizeSections', () => {
  it('is null without sections', () => {
    expect(summarizeSections(undefined)).toBeNull();
  });

  it('counts groups and all photos, other section included only in photos', () => {
    expect(
      summarizeSections([
        group('g1', 2),
        group('g2', 3),
        { key: 'other', title: 'Other', photoIds: ['x'] },
      ]),
    ).toBe('Showing: Similar Shots · 2 groups · 6 photos');
  });

  it('uses singular forms', () => {
    expect(summarizeSections([group('g1', 1)])).toBe(
      'Showing: Similar Shots · 1 group · 1 photo',
    );
  });

  it('reports zero groups and photos for empty sections', () => {
    expect(summarizeSections([])).toBe(
      'Showing: Similar Shots · 0 groups · 0 photos',
    );
  });

  it('is null without sections and without labels', () => {
    expect(summarizeSections(undefined, [], 5)).toBeNull();
  });

  it('shows one label with the photo count in the flat grid', () => {
    expect(summarizeSections(undefined, ['Possible Blur'], 3)).toBe(
      'Showing: Possible Blur · 3 photos',
    );
  });

  it('joins two labels and uses singular photo', () => {
    expect(summarizeSections(undefined, ['Possible Blur', 'Picked'], 1)).toBe(
      'Showing: Possible Blur + Picked · 1 photo',
    );
  });

  it('shows zero photos', () => {
    expect(summarizeSections(undefined, ['Picked'], 0)).toBe(
      'Showing: Picked · 0 photos',
    );
  });

  it('lists all labels with groups in the grouped view', () => {
    expect(
      summarizeSections(
        [group('g1', 2)],
        ['Possible Closed Eyes', 'Similar Shots'],
      ),
    ).toBe('Showing: Possible Closed Eyes + Similar Shots · 1 group · 2 photos');
  });
});
