import goldenCases from '../tests/golden/photoFlagsGolden.json';
import {photoStateStore} from '../src/lib/culledAlbum/photoStateStore';
import {
  buildKeyFaceVariantId,
  computeStats,
  DEFAULT_CULL_FILTERS,
  derivePhotoFlags,
  deriveStarRating,
  matchesCullFilterKey,
  normalizeCullFilters,
  orderPhotosForCulling,
  parseBurstFileName,
  parseKeyFaceVariantId,
} from '../src/lib/culling/cullingUtil';
import {makeCullingFace, makeCullingPhoto} from './helpers/fixtures';

afterEach(() => {
  photoStateStore.setState({
    photoState: {},
    photoOrder: {},
    gridRevision: {},
  });
});

describe('derivePhotoFlags / deriveStarRating golden cases', () => {
  it.each(goldenCases)('$name', testCase => {
    const faces = testCase.faces.map(face =>
      makeCullingFace({
        eyeStatus: face.eyeStatus as 'open' | 'closed' | 'partial',
        focusLevel: face.focusLevel as 'good' | 'soft' | 'blurred',
      }),
    );

    expect(derivePhotoFlags(faces)).toEqual(testCase.expectedFlags);
    expect(deriveStarRating(faces)).toBe(testCase.expectedStarRating);
  });
});

describe('normalizeCullFilters / matchesCullFilterKey', () => {
  it('fills missing filter keys from defaults', () => {
    expect(normalizeCullFilters({blurred: true})).toEqual({
      ...DEFAULT_CULL_FILTERS,
      blurred: true,
    });
    expect(normalizeCullFilters(null)).toEqual(DEFAULT_CULL_FILTERS);
  });

  it('keeps exclusive buckets for blurred, closed eyes, and duplicates', () => {
    const duplicated = makeCullingPhoto({
      photoId: 'dup',
      duplicated: true,
      aiSelected: true,
      maybe: true,
      blurred: true,
      closedEyes: true,
    });
    expect(matchesCullFilterKey(duplicated, 'duplicated')).toBe(true);
    expect(matchesCullFilterKey(duplicated, 'aiSelected')).toBe(false);
    expect(matchesCullFilterKey(duplicated, 'blurred')).toBe(false);
    expect(matchesCullFilterKey(duplicated, 'closedEyes')).toBe(false);

    const blurred = makeCullingPhoto({
      photoId: 'blur',
      blurred: true,
      closedEyes: false,
    });
    expect(matchesCullFilterKey(blurred, 'blurred')).toBe(true);
    expect(matchesCullFilterKey(blurred, 'closedEyes')).toBe(false);

    const closed = makeCullingPhoto({
      photoId: 'closed',
      closedEyes: true,
      blurred: true,
    });
    expect(matchesCullFilterKey(closed, 'blurred')).toBe(false);
    expect(matchesCullFilterKey(closed, 'closedEyes')).toBe(false);
  });
});

describe('computeStats', () => {
  it('counts selections and exclusive cull buckets', () => {
    const photos = [
      makeCullingPhoto({
        photoId: 'keep',
        selected: true,
        aiSelected: true,
        starRating: 5,
      }),
      makeCullingPhoto({
        photoId: 'maybe',
        selected: true,
        maybe: true,
        starRating: 4,
      }),
      makeCullingPhoto({
        photoId: 'blur',
        blurred: true,
        starRating: 1,
      }),
      makeCullingPhoto({
        photoId: 'dup',
        duplicated: true,
        aiSelected: true,
        starRating: 5,
      }),
    ];

    expect(computeStats(photos)).toEqual({
      totalPhotos: 4,
      mySelections: 2,
      aiSelected: 1,
      maybe: 1,
      blurred: 1,
      closedEyes: 0,
      duplicated: 1,
    });
  });
});

describe('orderPhotosForCulling', () => {
  it('follows stored photo order and appends leftovers', () => {
    photoStateStore.setState(state => {
      state.photoOrder['album-1'] = ['b', 'a'];
    });

    const ordered = orderPhotosForCulling('album-1', [
      {photoId: 'a'},
      {photoId: 'b'},
      {photoId: 'c'},
    ]);

    expect(ordered.map(photo => photo.photoId)).toEqual(['b', 'a', 'c']);
  });

  it('falls back to numeric filename sort when no order is stored', () => {
    const ordered = orderPhotosForCulling(
      'album-1',
      [{photoId: '2'}, {photoId: '10'}, {photoId: '1'}],
      photo => `IMG_${photo.photoId}.JPG`,
    );

    expect(ordered.map(photo => photo.photoId)).toEqual(['1', '2', '10']);
  });
});

describe('key face variant ids', () => {
  it('round-trips cluster, eye, and focus', () => {
    const faceId = buildKeyFaceVariantId('cluster-9', 'partial', 'soft');
    expect(parseKeyFaceVariantId(faceId)).toEqual({
      clusterId: 'cluster-9',
      eyeStatus: 'partial',
      focusLevel: 'soft',
    });
  });

  it('rejects malformed ids', () => {
    expect(parseKeyFaceVariantId('cluster-only')).toBeNull();
    expect(parseKeyFaceVariantId('id::wink::good')).toBeNull();
    expect(parseKeyFaceVariantId('id::open::sharp')).toBeNull();
  });
});

describe('parseBurstFileName', () => {
  it('reads camera stems and trailing counters', () => {
    expect(parseBurstFileName('IMG_1001.JPG')).toEqual({
      prefix: 'img_',
      index: 1001,
    });
    expect(parseBurstFileName('DSC05037.JPG')).toEqual({
      prefix: 'dsc',
      index: 5037,
    });
    expect(parseBurstFileName('no-numbers.jpg')).toBeNull();
    expect(parseBurstFileName(undefined)).toBeNull();
  });
});
