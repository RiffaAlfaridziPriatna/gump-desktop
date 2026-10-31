import {
  buildSimilarShotSections,
  indexGroupsByPhotoId,
  orderSimilarShotGroups,
  summarizeGroup,
} from '../src/lib/culling/similarShotGroups';
import type {
  CulledAlbumPhoto,
  CullingDuplicateGroup,
} from '../src/lib/culledAlbum/types';
import { makeCulledAlbumPhoto, makeUploadFile } from './helpers/fixtures';

function photo(
  photoId: string,
  capturedAt: number | null,
  overrides: Partial<CulledAlbumPhoto> = {},
): CulledAlbumPhoto {
  return makeCulledAlbumPhoto({ photoId, capturedAt, ...overrides });
}

function byId(photos: CulledAlbumPhoto[]): Map<string, CulledAlbumPhoto> {
  return new Map(photos.map(item => [item.photoId, item]));
}

function group(
  groupId: string,
  photoIds: string[],
  bestPhotoId = photoIds[0]!,
): CullingDuplicateGroup {
  return { groupId, photoIds, bestPhotoId };
}

describe('indexGroupsByPhotoId', () => {
  it('maps every member to its group index', () => {
    const index = indexGroupsByPhotoId([
      group('g1', ['a', 'b']),
      group('g2', ['c', 'd']),
    ]);
    expect([...index.entries()]).toEqual([
      ['a', 0],
      ['b', 0],
      ['c', 1],
      ['d', 1],
    ]);
  });

  it('returns an empty map for undefined or empty groups', () => {
    expect(indexGroupsByPhotoId(undefined).size).toBe(0);
    expect(indexGroupsByPhotoId([]).size).toBe(0);
  });
});

describe('orderSimilarShotGroups', () => {
  it('returns [] for undefined or empty groups', () => {
    expect(orderSimilarShotGroups(undefined, new Map())).toEqual([]);
    expect(orderSimilarShotGroups([], new Map())).toEqual([]);
  });

  it('drops stale ids and groups left with fewer than 2 live members', () => {
    const photos = byId([photo('a', 1), photo('b', 2), photo('c', 3)]);
    const ordered = orderSimilarShotGroups(
      [group('g1', ['a', 'deleted', 'b']), group('g2', ['c', 'gone'])],
      photos,
    );
    expect(ordered).toEqual([
      { groupId: 'g1', photoIds: ['a', 'b'], bestPhotoId: 'a' },
    ]);
  });

  it('orders groups by earliest member and members by capturedAt', () => {
    const photos = byId([
      photo('late1', 50),
      photo('late2', 40),
      photo('early1', 30),
      photo('early2', 10),
    ]);
    const ordered = orderSimilarShotGroups(
      [group('late', ['late1', 'late2']), group('early', ['early1', 'early2'])],
      photos,
    );
    expect(ordered.map(item => item.groupId)).toEqual(['early', 'late']);
    expect(ordered[0]!.photoIds).toEqual(['early2', 'early1']);
    expect(ordered[1]!.photoIds).toEqual(['late2', 'late1']);
  });

  it('breaks equal capturedAt ties by file name, stable across input order', () => {
    const photos = byId([
      photo('x', 5, { file: makeUploadFile({ name: 'IMG_10.jpg' }) }),
      photo('y', 5, { file: makeUploadFile({ name: 'IMG_2.jpg' }) }),
      photo('z', 5, { file: makeUploadFile({ name: 'IMG_1.jpg' }) }),
    ]);
    const forward = orderSimilarShotGroups(
      [group('g', ['x', 'y', 'z'])],
      photos,
    );
    const reversed = orderSimilarShotGroups(
      [group('g', ['z', 'y', 'x'])],
      photos,
    );
    expect(forward[0]!.photoIds).toEqual(['z', 'y', 'x']);
    expect(reversed[0]!.photoIds).toEqual(['z', 'y', 'x']);
  });

  it('sorts members without capturedAt last', () => {
    const photos = byId([photo('none', null), photo('dated', 100)]);
    const ordered = orderSimilarShotGroups(
      [group('g', ['none', 'dated'])],
      photos,
    );
    expect(ordered[0]!.photoIds).toEqual(['dated', 'none']);
  });
});

describe('summarizeGroup', () => {
  it('counts selected only, independent of bestPhotoId', () => {
    const photos = byId([
      photo('best', 1, { aiSelected: true }),
      photo('picked', 2, { selected: true }),
      photo('other', 3),
    ]);
    expect(
      summarizeGroup(group('g', ['best', 'picked', 'other'], 'best'), photos),
    ).toEqual({ shotCount: 3, pickedCount: 1 });
  });

  it('ignores stale ids', () => {
    const photos = byId([photo('a', 1, { selected: true }), photo('b', 2)]);
    expect(summarizeGroup(group('g', ['a', 'gone', 'b']), photos)).toEqual({
      shotCount: 2,
      pickedCount: 1,
    });
  });
});

describe('buildSimilarShotSections', () => {
  const ordered = [
    group('g1', ['a', 'b']),
    group('g2', ['c', 'd']),
    group('g3', ['e', 'f']),
  ];

  it('returns no sections for no groups', () => {
    expect(buildSimilarShotSections([])).toEqual([]);
  });

  it('keeps every member, best photo included, without other filters', () => {
    expect(buildSimilarShotSections(ordered)).toEqual([
      {
        kind: 'group',
        groupNumber: 1,
        group: ordered[0],
        photoIds: ['a', 'b'],
      },
      {
        kind: 'group',
        groupNumber: 2,
        group: ordered[1],
        photoIds: ['c', 'd'],
      },
      {
        kind: 'group',
        groupNumber: 3,
        group: ordered[2],
        photoIds: ['e', 'f'],
      },
    ]);
  });

  it('filters members, hides empty groups, keeps group numbers stable', () => {
    const matching = new Set(['b', 'e']);
    expect(
      buildSimilarShotSections(ordered, photoId => matching.has(photoId)),
    ).toEqual([
      { kind: 'group', groupNumber: 1, group: ordered[0], photoIds: ['b'] },
      { kind: 'group', groupNumber: 3, group: ordered[2], photoIds: ['e'] },
    ]);
  });
});
