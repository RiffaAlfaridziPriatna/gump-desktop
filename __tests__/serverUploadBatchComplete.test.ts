import {createServerUploadQueue} from '../src/lib/culledAlbum/serverUploadQueue';
import {culledAlbumStore, getPhotoById} from '../src/lib/culledAlbum/store';
import {
  photoKey,
  photoStateStore,
} from '../src/lib/culledAlbum/photoStateStore';
import {
  getAlbumQueueState,
  setQueueOperationStatus,
  uploadQueueStore,
} from '../src/lib/culledAlbum/uploadQueueStore';
import {
  createCulledAlbumFromSelection,
  createCulledAlbumPhoto,
} from '../src/lib/culledAlbum/types';

jest.mock('@lib/navigation/uploadAwareNavigation', () => ({
  shouldDeferHeavyWorkForNavigation: () => false,
  shouldYieldUploadQueueForNavigation: () => false,
  runOrDeferHeavyWorkForNavigation: (fn: () => void) => fn(),
}));
jest.mock('../src/di/container', () => ({
  container: {
    resolve: () => ({
      countByUploadStatus: () => 0,
      sumFileSizeByAlbum: () => 0,
    }),
  },
}));
jest.mock('../src/lib/culledAlbum/storage', () => ({
  saveAlbum: jest.fn(() => Promise.resolve()),
}));
jest.mock('../src/lib/culledAlbum/sync', () => ({}));
jest.mock('../src/application/syncPhotoRepository', () => ({}));
jest.mock('../src/lib/observability/posthogClient', () => ({
  captureAppEvent: jest.fn(),
  captureAppException: jest.fn(),
}));
jest.mock('../src/lib/observability/reportError', () => ({
  reportError: jest.fn(),
}));
jest.mock('../src/lib/culledAlbum/photoLoader', () => ({
  ...jest.requireActual('../src/lib/culledAlbum/photoLoader'),
  hydratePhotos: jest.fn(() => []),
}));

const ALBUM = 'album-1';

function seed(ids: string[]): void {
  const photoState = Object.fromEntries(
    ids.map(id => {
      const photo = createCulledAlbumPhoto(
        {uri: `file:///${id}.jpg`, name: `${id}.jpg`, type: 'image/jpeg', size: 1},
        id,
      );
      photo.serverUploadStatus = 'pending';
      return [photoKey(ALBUM, id), photo];
    }),
  );
  photoStateStore.setState(() => ({photoState, photoOrder: {[ALBUM]: ids}}));
  const album = createCulledAlbumFromSelection({
    id: ALBUM,
    name: 'a',
    title: null,
    cover: null,
    coverMobile: null,
    link: '',
  } as never);
  album.uploadBatchPhotoIds = ids;
  culledAlbumStore.setState(state => {
    state.albums = {[ALBUM]: album};
  });
  uploadQueueStore.setState(state => {
    state.queues = {};
  });
  setQueueOperationStatus(ALBUM, 'serverUpload', 'active');
}

function makeQueue(uploadPhoto: jest.Mock) {
  const useCase = {startUpload: jest.fn(), markFailed: jest.fn(), markUploaded: jest.fn()};
  const queue = createServerUploadQueue({
    maxConcurrent: 2,
    uploadSelectedPhotosUseCase: useCase as never,
    getPhoto: (albumId, photoId) => getPhotoById(albumId, photoId),
    updatePhoto: (albumId, photoId, updater) => {
      const photo = getPhotoById(albumId, photoId);
      if (!photo) return false;
      updater(photo);
      return true;
    },
    persistAlbum: () => Promise.resolve(),
    uploadPhoto,
  });
  return {queue, useCase};
}

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 20));
const statusOf = (id: string) => getPhotoById(ALBUM, id)!.serverUploadStatus;

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('server upload queue settling', () => {
  it('success settles once and the batch completes', async () => {
    seed(['p1']);
    const uploadPhoto = jest.fn(async (albumId: string, photoId: string) => {
      getPhotoById(albumId, photoId)!.serverUploadStatus = 'uploaded';
    });
    const {queue} = makeQueue(uploadPhoto);
    queue.processPending(ALBUM);
    await flush();

    expect(uploadPhoto).toHaveBeenCalledTimes(1);
    expect(getAlbumQueueState(ALBUM).serverUpload.status).toBe('completed');
    expect(getAlbumQueueState(ALBUM).serverUpload.uploadedCount).toBe(1);
  });

  it('last photo failing ends the queue as failed, never active', async () => {
    seed(['p1']);
    const uploadPhoto = jest.fn(() => Promise.reject(new TypeError('Network request failed')));
    const {queue, useCase} = makeQueue(uploadPhoto);
    queue.processPending(ALBUM);
    await flush();

    expect(statusOf('p1')).toBe('failed');
    expect(useCase.markFailed).toHaveBeenCalledTimes(1);
    const serverUpload = getAlbumQueueState(ALBUM).serverUpload;
    expect(serverUpload.status).toBe('failed');
    expect(serverUpload.failedCount).toBe(1);
  });

  it('does not re-pick a failed photo on later processPending calls', async () => {
    seed(['p1', 'p2']);
    const uploadPhoto = jest.fn(async (albumId: string, photoId: string) => {
      if (photoId === 'p1') throw new TypeError('Network request failed');
      getPhotoById(albumId, photoId)!.serverUploadStatus = 'uploaded';
    });
    const {queue} = makeQueue(uploadPhoto);
    queue.processPending(ALBUM);
    await flush();
    queue.processPending(ALBUM);
    await flush();

    expect(uploadPhoto).toHaveBeenCalledTimes(2);
    expect(statusOf('p1')).toBe('failed');
    expect(statusOf('p2')).toBe('uploaded');
    expect(getAlbumQueueState(ALBUM).serverUpload.status).toBe('completed');
  });
});
