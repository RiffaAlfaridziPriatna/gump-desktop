import {
  bytesToGigabytes,
  formatStorageSizeGb,
  toAlbumCardModel,
} from '../src/lib/culledAlbum/format';
import {mergeAlbumPhotos, mergeWithMemoryAlbum} from '../src/lib/culledAlbum/merge';
import {
  comparePhotosByFilename,
  createCulledAlbumFromSelection,
  createCulledAlbumPhoto,
  hasInFlightAnalysis,
  hasInFlightUploads,
  isAnalysisInFlight,
  isCulledPhotoDisabled,
  isUploadInFlight,
  normalizePersistedPhoto,
  recomputeAlbumTotals,
  toCullingPhoto,
} from '../src/lib/culledAlbum/types';
import {
  computeAnalysisBatchCountsForIds,
  createAnalysisBatchCounts,
  isAnalysisBatchFinished,
  isAnalysisBatchFinishedByCounts,
  MAX_ANALYSIS_BATCH_TOTAL,
  resolveAnalysisBatchTotal,
} from '../src/lib/culledAlbum/analysisProgress';
import {
  computeLocalImportBatchProgress,
  createLocalImportBatchCounts,
  isLocalImportBatchFinishedForIds,
} from '../src/lib/culledAlbum/localImportProgress';
import {makeCullingFace, makeCulledAlbumPhoto, makeUploadFile} from './helpers/fixtures';

describe('album format helpers', () => {
  it('formats storage sizes', () => {
    expect(bytesToGigabytes(1024 ** 3)).toBe(1);
    expect(formatStorageSizeGb(0)).toBe('0.0 GB');
    expect(formatStorageSizeGb(2.34)).toBe('2.3 GB');
    expect(formatStorageSizeGb(0.001)).toBe('0.01 GB');
  });

  it('maps a local album to the card model', () => {
    const card = toAlbumCardModel({
      albumId: 'a1',
      name: 'Wedding',
      title: 'W',
      cover: {thumbnail: 't', small: null, medium: null, large: null},
      coverMobile: {thumbnail: null, small: null, medium: null, large: null},
      cullingCompleted: true,
      cullingHasUploads: false,
      link: 'https://gump.app/a/a1',
      createdAt: '2024-01-01T00:00:00.000Z',
      totalPhotos: 3,
      totalStorage: 1024 ** 3,
      syncedMediaCount: 10,
      syncedStorageGb: 2,
    });

    expect(card).toMatchObject({
      id: 'a1',
      totalMediaCount: 10,
      size: 2,
      cullingCompleted: true,
    });
  });
});

describe('create / persist photo helpers', () => {
  it('creates a pending local photo and converts it for culling', () => {
    const photo = createCulledAlbumPhoto(makeUploadFile({name: 'IMG.JPG', size: 50}), 'p1', 9);
    expect(photo.status).toBe('pending');
    expect(photo.analysisStatus).toBe('idle');
    expect(toCullingPhoto(photo).fileName).toBe('IMG.JPG');
  });

  it('resets in-flight persist fields and re-derives flags', () => {
    const photo = normalizePersistedPhoto(
      makeCulledAlbumPhoto({
        photoId: 'p1',
        status: 'uploading',
        progress: 40,
        analysisStatus: 'analyzing',
        analysisProgress: 20,
        serverUploadStatus: 'uploading',
        serverUploadProgress: 30,
        faces: [makeCullingFace({eyeStatus: 'closed', focusLevel: 'good'})],
      }),
    );

    expect(photo.status).toBe('pending');
    expect(photo.analysisStatus).toBe('analyzed');
    expect(photo.serverUploadStatus).toBe('pending');
    expect(photo.closedEyes).toBe(true);
    expect(photo.aiSelected).toBe(false);
  });
});

describe('album totals and in-flight flags', () => {
  it('recomputes totals and filename order', () => {
    const album = createCulledAlbumFromSelection({
      id: 'a1',
      name: 'N',
      title: null,
      cover: {thumbnail: null, small: null, medium: null, large: null},
      coverMobile: {thumbnail: null, small: null, medium: null, large: null},
      link: '',
    });
    album.photos = [
      makeCulledAlbumPhoto({
        photoId: 'b',
        file: makeUploadFile({name: 'IMG_2.JPG', size: 10}),
      }),
      makeCulledAlbumPhoto({
        photoId: 'a',
        file: makeUploadFile({name: 'IMG_10.JPG', size: 20}),
      }),
    ];
    recomputeAlbumTotals(album);
    expect(album.totalPhotos).toBe(2);
    expect(album.totalStorage).toBe(30);
    expect(
      [...album.photos].sort(comparePhotosByFilename).map(photo => photo.photoId),
    ).toEqual(['b', 'a']);
  });

  it('locks the album once anything has been uploaded', () => {
    const photo = makeCulledAlbumPhoto({photoId: 'p1'});
    expect(isCulledPhotoDisabled(photo, false)).toBe(false);
    expect(isCulledPhotoDisabled(photo, true)).toBe(true);
  });

  it('detects in-flight import and analysis from batch counts', () => {
    const pending = makeCulledAlbumPhoto({photoId: 'p1', status: 'pending'});
    expect(isUploadInFlight(pending)).toBe(true);
    expect(isAnalysisInFlight(pending)).toBe(false);

    const album = createCulledAlbumFromSelection({
      id: 'a1',
      name: 'N',
      title: null,
      cover: {thumbnail: null, small: null, medium: null, large: null},
      coverMobile: {thumbnail: null, small: null, medium: null, large: null},
      link: '',
    });
    album.localImportBatchPhotoIds = ['p1'];
    album.localImportBatchCounts = {
      total: 1,
      pending: 1,
      uploading: 0,
      uploaded: 0,
      failed: 0,
    };
    expect(hasInFlightUploads(album)).toBe(true);

    album.analysisBatchPhotoIds = ['p1'];
    album.analysisBatchCounts = {
      total: 1,
      pending: 0,
      analyzing: 1,
      analyzed: 0,
      failed: 0,
    };
    expect(hasInFlightAnalysis(album, [pending])).toBe(true);
    expect(hasInFlightUploads(null)).toBe(false);
  });
});

describe('mergeAlbumPhotos', () => {
  it('prefers an in-flight incoming photo over a stale persisted copy', () => {
    const persisted = makeCulledAlbumPhoto({
      photoId: 'p1',
      status: 'uploaded',
      analysisStatus: 'analyzed',
    });
    const incoming = makeCulledAlbumPhoto({
      photoId: 'p1',
      status: 'uploading',
      analysisStatus: 'idle',
    });
    expect(mergeAlbumPhotos([persisted], [incoming])[0]?.status).toBe(
      'uploading',
    );
    expect(mergeWithMemoryAlbum([persisted], null)).toEqual([persisted]);
  });
});

describe('analysis batch progress', () => {
  it('prefers the queued total and rejects huge native reports', () => {
    expect(resolveAnalysisBatchTotal(9, 4, 0)).toBe(4);
    expect(resolveAnalysisBatchTotal(MAX_ANALYSIS_BATCH_TOTAL + 1, 0, 0)).toBe(0);
    expect(createAnalysisBatchCounts(3)).toEqual({
      total: 3,
      pending: 3,
      analyzing: 0,
      analyzed: 0,
      failed: 0,
    });
  });

  it('finishes only when every queued photo is analyzed or failed', () => {
    const photos = [
      makeCulledAlbumPhoto({photoId: 'a', analysisStatus: 'analyzed'}),
      makeCulledAlbumPhoto({photoId: 'b', analysisStatus: 'failed'}),
      makeCulledAlbumPhoto({photoId: 'c', analysisStatus: 'analyzing'}),
    ];
    expect(isAnalysisBatchFinished(photos, ['a', 'b'])).toBe(true);
    expect(isAnalysisBatchFinished(photos, ['a', 'c'])).toBe(false);
    expect(
      isAnalysisBatchFinishedByCounts({
        total: 2,
        pending: 0,
        analyzing: 0,
        analyzed: 1,
        failed: 1,
      }),
    ).toBe(true);
    expect(
      computeAnalysisBatchCountsForIds(['a', 'c'], id =>
        photos.find(photo => photo.photoId === id),
      ),
    ).toEqual({
      total: 2,
      pending: 0,
      analyzing: 1,
      analyzed: 1,
      failed: 0,
    });
  });
});

describe('local import batch progress', () => {
  it('computes remaining work as 0-1 progress', () => {
    expect(
      computeLocalImportBatchProgress(createLocalImportBatchCounts(4)),
    ).toBe(0);
    expect(
      computeLocalImportBatchProgress({
        total: 4,
        pending: 1,
        uploading: 1,
        uploaded: 2,
        failed: 0,
      }),
    ).toBe(0.5);
  });

  it('is finished when every id is uploaded or failed', () => {
    const photos = new Map([
      ['a', makeCulledAlbumPhoto({photoId: 'a', status: 'uploaded'})],
      ['b', makeCulledAlbumPhoto({photoId: 'b', status: 'failed'})],
      ['c', makeCulledAlbumPhoto({photoId: 'c', status: 'uploading'})],
    ]);
    expect(isLocalImportBatchFinishedForIds(['a', 'b'], id => photos.get(id))).toBe(
      true,
    );
    expect(isLocalImportBatchFinishedForIds(['a', 'c'], id => photos.get(id))).toBe(
      false,
    );
    expect(isLocalImportBatchFinishedForIds([], id => photos.get(id))).toBe(false);
  });
});
