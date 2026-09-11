jest.mock('@lib/culledAlbum/store', () => ({
  getPhotoById: jest.fn(),
  updatePhoto: jest.fn(),
}));

jest.mock('@lib/storage/localStorage', () => ({
  readImageCaptureTime: jest.fn(),
  computePerceptualHash: jest.fn(),
}));

import {LruCache} from '../src/lib/media/lruCache';
import {hammingDistance} from '../src/lib/media/perceptualHash';
import {parsePickerCaptureTime} from '../src/lib/media/imageCaptureTime';
import {
  arePerceptualHashesSimilar,
  PERCEPTUAL_HASH_DUPLICATE_THRESHOLD,
} from '../src/lib/culling/cullingUtil';

describe('hammingDistance', () => {
  it('counts differing bits between 64-bit hex hashes', () => {
    expect(hammingDistance('0000000000000000', '0000000000000000')).toBe(0);
    expect(hammingDistance('0000000000000001', '0000000000000000')).toBe(1);
    expect(hammingDistance('ffffffffffffffff', '0000000000000000')).toBe(64);
  });
});

describe('arePerceptualHashesSimilar', () => {
  it('rejects missing hashes and accepts near-identical ones', () => {
    expect(arePerceptualHashesSimilar(null, '0000000000000000')).toBe(false);
    expect(
      arePerceptualHashesSimilar('0000000000000000', '0000000000000001'),
    ).toBe(true);
    expect(PERCEPTUAL_HASH_DUPLICATE_THRESHOLD).toBe(4);
  });
});

describe('LruCache', () => {
  it('evicts the least recently used entry', () => {
    const cache = new LruCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1);
    cache.set('c', 3);
    expect(cache.has('b')).toBe(false);
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });

  it('clamps max size to at least 1', () => {
    const cache = new LruCache<string, string>(0);
    cache.set('a', '1');
    cache.set('b', '2');
    expect(cache.has('a')).toBe(false);
    expect(cache.get('b')).toBe('2');
  });
});

describe('parsePickerCaptureTime', () => {
  it('parses ISO timestamps and ignores junk', () => {
    expect(parsePickerCaptureTime('2024-01-02T03:04:05.000Z')).toBe(
      Date.parse('2024-01-02T03:04:05.000Z'),
    );
    expect(parsePickerCaptureTime('not-a-date')).toBeNull();
    expect(parsePickerCaptureTime(undefined)).toBeNull();
  });
});
