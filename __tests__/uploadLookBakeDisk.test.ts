import {
  makeFakeGumpLocalStorage,
  makeNativeError,
} from './helpers/exportUploadFakes';

const MB = 1024 ** 2;
const MARGIN = 500 * MB;

const mockNative: {current: ReturnType<typeof makeFakeGumpLocalStorage>} = {
  current: makeFakeGumpLocalStorage(),
};
const mockReportError = jest.fn();
const mockPhotos: Record<string, unknown> = {};

jest.mock('react-native', () => ({
  Platform: {OS: 'macos'},
  NativeModules: {
    GumpLocalStorage: new Proxy(
      {},
      {
        get: (_target, key) =>
          (mockNative.current as Record<PropertyKey, unknown>)[key],
      },
    ),
  },
}));
jest.mock('@lib/observability/reportError', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));
jest.mock('@lib/culledAlbum/store', () => ({
  getPhotoById: (_albumId: string, photoId: string) => mockPhotos[photoId],
  getAlbum: () => null,
}));
jest.mock('@lib/look/bakeLook', () => ({
  photoNeedsLookBake: (photo: {lookId?: string}) => Boolean(photo.lookId),
  bakeLooksForPhotos: async (photos: Array<{photoId: string}>) => {
    const out = new Map();
    for (const photo of photos) {
      const baked = await mockNative.current.applyLook();
      out.set(photo.photoId, {photoId: photo.photoId, ...baked});
    }
    return out;
  },
}));

import {ExportError} from '@lib/export/types';
import {
  bakeLooksForUploadBatch,
  getUploadLookBakeState,
  isUploadLookBakeBlocking,
} from '@lib/look/uploadLookBake';

const ALBUM = 'album-1';

function setPhotos(sizes: number[]) {
  sizes.forEach((size, i) => {
    mockPhotos[`p${i}`] = {
      photoId: `p${i}`,
      lookId: 'look',
      file: {size, name: `p${i}.jpg`, uri: 'file:///src.jpg'},
    };
  });
}
const ids = () => Object.keys(mockPhotos);

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(mockPhotos)) delete mockPhotos[key];
});

describe('bakeLooksForUploadBatch disk check', () => {
  it('fails with diskFull before any applyLook call when staging is low', async () => {
    mockNative.current = makeFakeGumpLocalStorage({disk: 'lowStaging'});
    setPhotos([20 * MB, 30 * MB]);

    await expect(bakeLooksForUploadBatch(ALBUM, ids())).rejects.toMatchObject({
      reason: 'diskFull',
    });

    expect(mockNative.current.applyLook).not.toHaveBeenCalled();
    expect(getUploadLookBakeState(ALBUM)).toMatchObject({
      status: 'failed',
      reason: 'diskFull',
      requiredBytes: 50 * MB + MARGIN,
    });
  });

  it('does not block the upload queue gate after a diskFull failure', async () => {
    mockNative.current = makeFakeGumpLocalStorage({disk: 'lowStaging'});
    setPhotos([20 * MB]);
    await bakeLooksForUploadBatch(ALBUM, ids()).catch(() => undefined);
    expect(isUploadLookBakeBlocking(ALBUM)).toBe(false);
  });

  it('rejects with a diskFull ExportError so the provider skips the queue', async () => {
    mockNative.current = makeFakeGumpLocalStorage({disk: 'lowStaging'});
    setPhotos([20 * MB]);
    const error = await bakeLooksForUploadBatch(ALBUM, ids()).catch(e => e);
    expect(error).toBeInstanceOf(ExportError);
    expect(error.reason).toBe('diskFull');
  });

  it('maps native E_DISK_FULL from applyLook to the same state', async () => {
    mockNative.current = makeFakeGumpLocalStorage({export: 'applyLookDiskFull'});
    setPhotos([20 * MB]);

    const error = await bakeLooksForUploadBatch(ALBUM, ids()).catch(e => e);

    expect(error).toBeInstanceOf(ExportError);
    expect(getUploadLookBakeState(ALBUM)).toMatchObject({
      status: 'failed',
      reason: 'diskFull',
      requiredBytes: 20 * MB + MARGIN,
    });
  });

  it('reports and continues when getFreeDiskSpace throws', async () => {
    mockNative.current = makeFakeGumpLocalStorage({disk: 'diskSpaceThrows'});
    setPhotos([20 * MB]);

    await bakeLooksForUploadBatch(ALBUM, ids());

    expect(mockReportError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({step: 'getFreeDiskSpace'}),
    );
    expect(mockNative.current.applyLook).toHaveBeenCalled();
    expect(getUploadLookBakeState(ALBUM)).toMatchObject({status: 'ready'});
  });

  it('keeps non-disk failures as plain errors with reason unknown', async () => {
    mockNative.current = makeFakeGumpLocalStorage();
    mockNative.current.applyLook.mockRejectedValueOnce(makeNativeError('ELOOK'));
    setPhotos([MB]);

    const error = await bakeLooksForUploadBatch(ALBUM, ids()).catch(e => e);

    expect(error).not.toBeInstanceOf(ExportError);
    expect(getUploadLookBakeState(ALBUM)).toMatchObject({
      status: 'failed',
      reason: 'unknown',
      requiredBytes: undefined,
    });
  });
});
