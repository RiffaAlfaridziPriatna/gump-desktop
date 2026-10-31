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
});
