import {APIException} from '../src/services/api/exception';
import {reportError} from '../src/lib/observability/reportError';
import {createServerUploadQueue} from '../src/lib/culledAlbum/serverUploadQueue';
import {
  culledAlbumStore,
  getPhotoById,
} from '../src/lib/culledAlbum/store';
import {
  photoKey,
  photoStateStore,
} from '../src/lib/culledAlbum/photoStateStore';
import {
  createCulledAlbumFromSelection,
  createCulledAlbumPhoto,
} from '../src/lib/culledAlbum/types';
import {legacyPhotoToDomain} from '../src/lib/culledAlbum/photoMapper';
import {CulledPhoto} from '../src/domain/entities/CulledPhoto';
import {domainPhotoToLegacy} from '../src/lib/culledAlbum/photoMapper';

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
jest.mock('../src/lib/observability/reportError', () => ({
  reportError: jest.fn(),
}));
jest.mock('../src/lib/culledAlbum/photoLoader', () => ({
  ...jest.requireActual('../src/lib/culledAlbum/photoLoader'),
  hydratePhotos: jest.fn(() => []),
}));
jest.mock('../src/lib/culledAlbum/store', () => ({
  ...jest.requireActual('../src/lib/culledAlbum/store'),
  checkServerUploadBatchComplete: jest.fn(() => Promise.resolve()),
}));

const ALBUM = 'album-1';
const FULL_PATH = '/Users/someone/private/photo-1.jpg';

function seedPhoto(): void {
  const photo = createCulledAlbumPhoto(
    {
      uri: `file://${FULL_PATH}`,
      name: 'photo-1.jpg',
      type: 'image/jpeg',
      size: 10,
    },
    'p1',
  );
  photo.serverUploadStatus = 'pending';
  photoStateStore.setState(() => ({
    photoState: {[photoKey(ALBUM, 'p1')]: photo},
    photoOrder: {[ALBUM]: ['p1']},
  }));
  const album = createCulledAlbumFromSelection({
    id: ALBUM,
    name: 'a',
    title: null,
    cover: null,
    coverMobile: null,
    link: '',
  } as never);
  album.uploadBatchPhotoIds = ['p1'];
  culledAlbumStore.setState(state => {
    state.albums = {[ALBUM]: album};
  });
}

async function runWithError(err: unknown): Promise<jest.Mock> {
  seedPhoto();
  const uploadPhoto = jest.fn(() => Promise.reject(err));
  const queue = createServerUploadQueue({
    maxConcurrent: 1,
    uploadSelectedPhotosUseCase: {
      startUpload: jest.fn(),
      markFailed: jest.fn(),
      markUploaded: jest.fn(),
    } as never,
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
  queue.processPending(ALBUM);
  await new Promise<void>(resolve => setImmediate(resolve));
  return uploadPhoto;
}

beforeEach(() => jest.clearAllMocks());

describe('server upload queue failure', () => {
  it.each([
    [new APIException(503, 'Error', 'down', undefined), 'server'],
    [new APIException(403, 'USER_STORAGE_GB_LIMIT', 'full', undefined), 'storageLimit'],
    [new APIException(400, 'Error', 'bad', undefined), 'rejected'],
    [new TypeError('Network request failed'), 'network'],
  ])('stores the cause next to the error and reports once', async (err, cause) => {
    const uploadPhoto = await runWithError(err);
    expect(uploadPhoto).toHaveBeenCalledTimes(1);

    const photo = getPhotoById(ALBUM, 'p1')!;
    expect(photo.serverUploadStatus).toBe('failed');
    expect(photo.serverUploadCause).toBe(cause);
    expect(photo.serverUploadError).toBeTruthy();

    expect(reportError).toHaveBeenCalledTimes(1);
    const context = (reportError as jest.Mock).mock.calls[0][1];
    expect(context).toMatchObject({albumId: ALBUM, photoId: 'p1', cause});
    expect(JSON.stringify(context)).not.toContain(FULL_PATH);
  });
});

describe('serverUploadCause persistence', () => {
  it('survives the store to domain to store round trip', () => {
    const photo = createCulledAlbumPhoto(
      {uri: 'file:///x.jpg', name: 'x.jpg', type: 'image/jpeg', size: 1},
      'p1',
    );
    photo.serverUploadStatus = 'failed';
    photo.serverUploadCause = 'rateLimited';

    const domain = legacyPhotoToDomain(photo, ALBUM);
    const restored = CulledPhoto.fromPlain(
      ALBUM,
      JSON.parse(JSON.stringify(domain.toPlain())),
    );
    expect(domainPhotoToLegacy(restored).serverUploadCause).toBe('rateLimited');
  });

  it('drops an unknown stored cause', () => {
    const restored = CulledPhoto.fromPlain(ALBUM, {
      ...createCulledAlbumPhoto(
        {uri: 'file:///x.jpg', name: 'x.jpg', type: 'image/jpeg', size: 1},
        'p1',
      ),
      serverUploadCause: 'martian',
    });
    expect(domainPhotoToLegacy(restored).serverUploadCause).toBeUndefined();
  });
});
