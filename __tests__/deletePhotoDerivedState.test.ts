import {
  addStatsDelta,
  combineStatsDelta,
  emptyStatsDelta,
  patchDuplicateGroupsAfterDelete,
  patchKeyFacesAfterDelete,
  statsContributionFromPhoto,
  subtractStatsDelta,
  syncKeyFaceCropUrisFromPhotos,
} from '../src/lib/culling/deletePhotoDerivedState';
import {buildKeyFaceVariantId} from '../src/lib/culling/cullingUtil';
import {makeCullingFace, makeCulledAlbumPhoto} from './helpers/fixtures';

describe('stats deltas', () => {
  it('counts a selected AI pick', () => {
    const photo = makeCulledAlbumPhoto({
      photoId: 'keep',
      selected: true,
      aiSelected: true,
      starRating: 5,
    });
    expect(statsContributionFromPhoto(photo)).toEqual({
      totalPhotos: 1,
      mySelections: 1,
      aiSelected: 1,
      maybe: 0,
      blurred: 0,
      closedEyes: 0,
      duplicated: 0,
    });
  });

  it('adds, subtracts, and clamps below zero', () => {
    const base = {
      totalPhotos: 2,
      mySelections: 1,
      aiSelected: 1,
      maybe: 0,
      blurred: 0,
      closedEyes: 0,
      duplicated: 0,
    };
    const next = addStatsDelta(base, {
      totalPhotos: -5,
      mySelections: 1,
      aiSelected: 0,
      maybe: 0,
      blurred: 0,
      closedEyes: 0,
      duplicated: 0,
    });
    expect(next.totalPhotos).toBe(0);
    expect(next.mySelections).toBe(2);

    expect(
      subtractStatsDelta(
        combineStatsDelta(emptyStatsDelta(), {
          totalPhotos: 3,
          mySelections: 1,
          aiSelected: 0,
          maybe: 0,
          blurred: 0,
          closedEyes: 0,
          duplicated: 0,
        }),
        {
          totalPhotos: 1,
          mySelections: 1,
          aiSelected: 0,
          maybe: 0,
          blurred: 0,
          closedEyes: 0,
          duplicated: 0,
        },
      ),
    ).toEqual({
      totalPhotos: 2,
      mySelections: 0,
      aiSelected: 0,
      maybe: 0,
      blurred: 0,
      closedEyes: 0,
      duplicated: 0,
    });
  });
});

describe('patchDuplicateGroupsAfterDelete', () => {
  it('drops a pair and unflags the leftover photo', () => {
    const leftover = makeCulledAlbumPhoto({
      photoId: 'keep',
      duplicated: true,
      aiSelected: true,
    });
    const photos = new Map([[leftover.photoId, leftover]]);

    const result = patchDuplicateGroupsAfterDelete(
      [{groupId: 'g1', photoIds: ['gone', 'keep'], bestPhotoId: 'keep'}],
      'gone',
      id => photos.get(id),
    );

    expect(result.groups).toEqual([]);
    expect(result.flagChanges).toEqual([{photoId: 'keep', duplicated: false}]);
    expect(result.statsDelta.duplicated).toBe(-1);
  });

  it('re-picks the best remaining keeper', () => {
    const photos = new Map([
      [
        'a',
        makeCulledAlbumPhoto({
          photoId: 'a',
          duplicated: false,
          starRating: 5,
          capturedAt: 10,
        }),
      ],
      [
        'b',
        makeCulledAlbumPhoto({
          photoId: 'b',
          duplicated: true,
          starRating: 4,
          capturedAt: 20,
        }),
      ],
      [
        'c',
        makeCulledAlbumPhoto({
          photoId: 'c',
          duplicated: true,
          starRating: 5,
          capturedAt: 30,
        }),
      ],
    ]);

    const result = patchDuplicateGroupsAfterDelete(
      [{groupId: 'g1', photoIds: ['a', 'b', 'c'], bestPhotoId: 'a'}],
      'a',
      id => photos.get(id),
    );

    expect(result.groups).toEqual([
      {groupId: 'g1', photoIds: ['b', 'c'], bestPhotoId: 'c'},
    ]);
    expect(result.flagChanges).toEqual([
      {photoId: 'c', duplicated: false},
    ]);
  });
});

describe('patchKeyFacesAfterDelete', () => {
  it('removes a face with no remaining photos', () => {
    const result = patchKeyFacesAfterDelete(
      [
        {
          faceId: 'cluster-1::open::good',
          photoIds: ['gone'],
          eyeStatus: 'open',
          focusLevel: 'good',
          occurrenceCount: 1,
          sourcePhotoId: 'gone',
        },
      ],
      'gone',
      () => undefined,
    );
    expect(result.keyFaces).toEqual([]);
  });

  it('rebinds the source photo when the representative is deleted', () => {
    const successor = makeCulledAlbumPhoto({
      photoId: 'next',
      faces: [
        makeCullingFace({
          rekognitionFaceId: 'cluster-1',
          eyeStatus: 'open',
          focusLevel: 'good',
          cropUri: 'file:///crop.jpg',
          boundingBox: {left: 0.1, top: 0.2, width: 0.3, height: 0.4},
        }),
      ],
    });

    const result = patchKeyFacesAfterDelete(
      [
        {
          faceId: buildKeyFaceVariantId('cluster-1', 'open', 'good'),
          photoIds: ['gone', 'next'],
          eyeStatus: 'open',
          focusLevel: 'good',
          occurrenceCount: 2,
          sourcePhotoId: 'gone',
        },
      ],
      'gone',
      id => (id === 'next' ? successor : undefined),
    );

    expect(result.successorPhotoIds).toEqual(['next']);
    expect(result.keyFaces[0]).toMatchObject({
      sourcePhotoId: 'next',
      sourceFaceIndex: 0,
      occurrenceCount: 1,
      cropUri: 'file:///crop.jpg',
    });
  });
});

describe('syncKeyFaceCropUrisFromPhotos', () => {
  it('fills missing crop URIs from the source face', () => {
    const photo = makeCulledAlbumPhoto({
      photoId: 'p1',
      faces: [
        makeCullingFace({
          cropUri: 'file:///from-photo.jpg',
          boundingBox: {left: 0.2, top: 0.2, width: 0.2, height: 0.2},
        }),
      ],
    });

    const synced = syncKeyFaceCropUrisFromPhotos(
      [
        {
          faceId: 'cluster-1::open::good',
          photoIds: ['p1'],
          eyeStatus: 'open',
          focusLevel: 'good',
          occurrenceCount: 1,
          sourcePhotoId: 'p1',
          sourceFaceIndex: 0,
        },
      ],
      id => (id === 'p1' ? photo : undefined),
    );

    expect(synced[0]?.cropUri).toBe('file:///from-photo.jpg');
  });
});
