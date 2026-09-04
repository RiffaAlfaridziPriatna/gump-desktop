import {matchesCulledAlbumGridFilters} from '../src/lib/culling/culledAlbumPhotoFilters';
import {makeCullingPhoto} from './helpers/fixtures';

describe('matchesCulledAlbumGridFilters', () => {
  const photo = makeCullingPhoto({
    photoId: 'p1',
    selected: true,
    starRating: 4,
  });

  it('rejects missing analysis', () => {
    expect(
      matchesCulledAlbumGridFilters(undefined, {
        selection: null,
        starRating: [],
      }),
    ).toBe(false);
  });

  it('filters by selection', () => {
    expect(
      matchesCulledAlbumGridFilters(photo, {
        selection: 'selected',
        starRating: [],
      }),
    ).toBe(true);
    expect(
      matchesCulledAlbumGridFilters(photo, {
        selection: 'unselected',
        starRating: [],
      }),
    ).toBe(false);
  });

  it('treats null starRating as zero', () => {
    const unrated = makeCullingPhoto({
      photoId: 'p2',
      selected: false,
      starRating: null,
    });
    expect(
      matchesCulledAlbumGridFilters(unrated, {
        selection: null,
        starRating: [0],
      }),
    ).toBe(true);
    expect(
      matchesCulledAlbumGridFilters(unrated, {
        selection: null,
        starRating: [5],
      }),
    ).toBe(false);
  });

  it('allows any of the selected star ratings', () => {
    expect(
      matchesCulledAlbumGridFilters(photo, {
        selection: null,
        starRating: [3, 4],
      }),
    ).toBe(true);
  });
});
