import {captureAppEvent} from '../src/lib/observability/posthogClient';
import {
  createCulledAlbumFromSelection,
  createCulledAlbumPhoto,
  type CulledAlbumPhoto,
} from '../src/lib/culledAlbum/types';
import type {UploadFailureCause} from '../src/lib/culledAlbum/uploadPreflight';
import {
  culledAlbumStore,
  retryFailedServerUploads,
} from '../src/lib/culledAlbum/store';
import {
  photoKey,
  photoStateStore,
} from '../src/lib/culledAlbum/photoStateStore';
import {
  finishServerUploadQueue,
  getAlbumQueueState,
  markCompletionSeen,
  uploadQueueStore,
} from '../src/lib/culledAlbum/uploadQueueStore';

jest.mock('@lib/navigation/uploadAwareNavigation', () => ({
  shouldDeferHeavyWorkForNavigation: () => false,
  shouldYieldUploadQueueForNavigation: () => false,
  runOrDeferHeavyWorkForNavigation: (fn: () => void) => fn(),
}));
jest.mock('../src/di/container', () => ({container: {resolve: jest.fn()}}));
jest.mock('../src/lib/culledAlbum/storage', () => ({}));
jest.mock('../src/lib/culledAlbum/sync', () => ({}));
jest.mock('../src/application/syncPhotoRepository', () => ({}));
jest.mock('../src/lib/observability/posthogClient', () => ({
  captureAppEvent: jest.fn(),
  captureAppException: jest.fn(),
}));
jest.mock('../src/lib/culledAlbum/photoLoader', () => ({
  ...jest.requireActual('../src/lib/culledAlbum/photoLoader'),
  hydratePhotos: jest.fn(() => []),
}));

const ALBUM = 'album-1';

type Seed = {
  id: string;
  status: CulledAlbumPhoto['serverUploadStatus'];
  cause?: UploadFailureCause;
};

function seed(photos: Seed[]): void {
  const photoState: Record<string, CulledAlbumPhoto> = {};
  for (const {id, status, cause} of photos) {
    const photo = createCulledAlbumPhoto(
      {
        uri: `file:///secret/dir/${id}.jpg`,
        name: `${id}.jpg`,
        type: 'image/jpeg',
        size: 10,
      },
      id,
    );
    photo.serverUploadStatus = status;
    photo.serverUploadError = status === 'failed' ? 'Upload failed' : undefined;
    photo.serverUploadCause = cause;
    photoState[photoKey(ALBUM, id)] = photo;
  }
  photoStateStore.setState(() => ({
    photoState,
    photoOrder: {[ALBUM]: photos.map(p => p.id)},
  }));
  const album = createCulledAlbumFromSelection({
    id: ALBUM,
    name: 'a',
    title: null,
    cover: null,
    coverMobile: null,
    link: '',
  } as never);
  album.uploadBatchPhotoIds = photos.map(p => p.id);
  culledAlbumStore.setState(state => {
    state.albums = {[ALBUM]: album};
  });
}

const photoOf = (id: string) =>
  photoStateStore.getState().photoState[photoKey(ALBUM, id)]!;

beforeEach(() => {
  jest.clearAllMocks();
  uploadQueueStore.setState(state => {
    state.queues = {};
  });
});

describe('retryFailedServerUploads', () => {
  const mixed: Seed[] = [
    {id: 'net', status: 'failed', cause: 'network'},
    {id: 'srv', status: 'failed', cause: 'server'},
    {id: 'quota', status: 'failed', cause: 'storageLimit'},
    {id: 'final', status: 'failed', cause: 'rejected'},
    {id: 'gone', status: 'failed', cause: 'sourceMissing'},
    {id: 'done', status: 'uploaded'},
    {id: 'idle', status: 'idle'},
  ];

  it('re-queues only retryable photos by default', () => {
    seed(mixed);
    expect(retryFailedServerUploads(ALBUM, {includeQuota: false})).toEqual([
      'net',
      'srv',
    ]);
    expect(photoOf('net').serverUploadStatus).toBe('pending');
    expect(photoOf('net').serverUploadCause).toBeUndefined();
    expect(photoOf('quota').serverUploadStatus).toBe('failed');
    expect(
      culledAlbumStore.getState().albums[ALBUM]!.uploadBatchPhotoIds,
    ).toEqual(mixed.map(p => p.id));
  });

  it('keeps the full batch so retry with includeQuota after one without still finds quota photos', () => {
    seed(mixed);
    retryFailedServerUploads(ALBUM, {includeQuota: false});
    photoOf('net').serverUploadStatus = 'uploaded';
    photoOf('srv').serverUploadStatus = 'uploaded';
    finishServerUploadQueue(ALBUM, {
      status: 'completed',
      uploadedCount: 2,
      failedCount: 3,
    });

    expect(retryFailedServerUploads(ALBUM, {includeQuota: true})).toEqual([
      'quota',
    ]);
  });

  it.each(['active', 'finalizing'] as const)(
    'returns nothing while the queue is %s',
    queueStatus => {
      seed(mixed);
      uploadQueueStore.setState(state => {
        state.queues[ALBUM] = {
          localImport: {status: 'idle', completionSeen: false, batchTotal: 0, uploadedCount: 0, failedCount: 0},
          analysis: {status: 'idle', completionSeen: false, batchTotal: 0, uploadedCount: 0, failedCount: 0},
          serverUpload: {status: queueStatus, completionSeen: false, batchTotal: 1, uploadedCount: 0, failedCount: 0},
        };
      });
      expect(retryFailedServerUploads(ALBUM, {includeQuota: true})).toEqual([]);
      expect(photoOf('net').serverUploadStatus).toBe('failed');
    },
  );

  it.each(['pending', 'uploading'] as const)(
    'returns nothing while a batch photo is %s',
    photoStatus => {
      seed([...mixed, {id: 'busy', status: photoStatus}]);
      expect(retryFailedServerUploads(ALBUM, {includeQuota: true})).toEqual([]);
      expect(captureAppEvent).not.toHaveBeenCalled();
    },
  );

  it('adds quota photos only with includeQuota', () => {
    seed(mixed);
    expect(retryFailedServerUploads(ALBUM, {includeQuota: true})).toEqual([
      'net',
      'srv',
      'quota',
    ]);
  });

  it('never re-queues final, uploaded or idle photos', () => {
    seed(mixed);
    retryFailedServerUploads(ALBUM, {includeQuota: true});
    expect(photoOf('final').serverUploadStatus).toBe('failed');
    expect(photoOf('final').serverUploadCause).toBe('rejected');
    expect(photoOf('gone').serverUploadStatus).toBe('failed');
    expect(photoOf('done').serverUploadStatus).toBe('uploaded');
    expect(photoOf('idle').serverUploadStatus).toBe('idle');
  });

  it('treats a failed photo with no stored cause as retryable', () => {
    seed([{id: 'old', status: 'failed'}]);
    expect(retryFailedServerUploads(ALBUM, {includeQuota: false})).toEqual([
      'old',
    ]);
  });

  it('does nothing when no photo qualifies', () => {
    seed([{id: 'final', status: 'failed', cause: 'rejected'}]);
    expect(retryFailedServerUploads(ALBUM, {includeQuota: true})).toEqual([]);
    expect(captureAppEvent).not.toHaveBeenCalled();
    expect(getAlbumQueueState(ALBUM).serverUpload.status).toBe('idle');
  });

  it('resets queue failedCount and completionSeen for the retry batch', () => {
    seed(mixed);
    finishServerUploadQueue(ALBUM, {
      status: 'completed',
      uploadedCount: 1,
      failedCount: 5,
    });
    markCompletionSeen(ALBUM, 'serverUpload');

    retryFailedServerUploads(ALBUM, {includeQuota: false});

    expect(getAlbumQueueState(ALBUM).serverUpload).toEqual({
      status: 'active',
      completionSeen: false,
      batchTotal: 2,
      uploadedCount: 0,
      failedCount: 0,
    });
  });

  it('reports the retry once with counts per cause, without file paths', () => {
    seed(mixed);
    retryFailedServerUploads(ALBUM, {includeQuota: true});

    expect(captureAppEvent).toHaveBeenCalledTimes(1);
    const [event, props] = (captureAppEvent as jest.Mock).mock.calls[0];
    expect(event).toBe('server_upload_retried');
    expect(props).toMatchObject({
      albumId: ALBUM,
      retryCount: 3,
      includeQuota: true,
      cause_network: 1,
      cause_server: 1,
      cause_storageLimit: 1,
    });
    expect(props).not.toHaveProperty('photoIds');
    expect(JSON.stringify(props)).not.toContain('file://');
  });
});
