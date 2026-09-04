import {
  clearFaceClusterIndex,
  getFaceClusterIndex,
  seedFaceClusterIndex,
} from '../src/lib/culling/faceClusterIndex';
import {makeCullingFace, makeCulledAlbumPhoto} from './helpers/fixtures';

describe('faceClusterIndex', () => {
  afterEach(() => {
    clearFaceClusterIndex('album-1');
  });

  it('seeds unique cluster representatives from analyzed photos', () => {
    seedFaceClusterIndex('album-1', [
      makeCulledAlbumPhoto({
        photoId: 'idle',
        analysisStatus: 'idle',
        faces: [
          makeCullingFace({
            rekognitionFaceId: 'should-skip',
            boundingBox: {left: 0, top: 0, width: 0.5, height: 0.5},
          }),
        ],
      }),
      makeCulledAlbumPhoto({
        photoId: 'p1',
        faces: [
          makeCullingFace({
            rekognitionFaceId: 'cluster-a',
            boundingBox: {left: 0.1, top: 0.1, width: 0.2, height: 0.4},
          }),
          makeCullingFace({
            rekognitionFaceId: 'cluster-a',
            boundingBox: {left: 0, top: 0, width: 0.9, height: 0.9},
          }),
        ],
      }),
    ]);

    const index = getFaceClusterIndex('album-1');
    expect(index.size).toBe(1);
    expect(index.get('cluster-a')?.area).toBeCloseTo(0.2 * 0.4);
  });

  it('does not reseed a non-empty index', () => {
    const index = getFaceClusterIndex('album-1');
    index.set('existing', {fingerprint: [1], area: 1});
    seedFaceClusterIndex('album-1', [
      makeCulledAlbumPhoto({
        photoId: 'p1',
        faces: [makeCullingFace({rekognitionFaceId: 'new'})],
      }),
    ]);
    expect([...getFaceClusterIndex('album-1').keys()]).toEqual(['existing']);
  });
});
