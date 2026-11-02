import {
  FAKE_DESTINATION_PATH,
  FAKE_STAGING_PATH,
  makeFakeGumpLocalStorage,
  makeNativeError,
} from './helpers/exportUploadFakes';

const MB = 1024 ** 2;
const MARGIN = 500 * MB;

const mockNative: {current: ReturnType<typeof makeFakeGumpLocalStorage>} = {
  current: makeFakeGumpLocalStorage(),
};
const mockReportError = jest.fn();
const mockBake = jest.fn();

jest.mock('react-native', () => ({
  Platform: {OS: 'macos'},
  NativeModules: {
    // nativeExport captures the module once; delegate so scenarios can swap.
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
jest.mock('@lib/look/bakeLook', () => ({
  bakeLooksForPhotos: (...args: unknown[]) => mockBake(...args),
  photoNeedsLookBake: () => false,
}));
jest.mock('@lib/storage/localStorage', () => ({
  ensureDetail: jest.fn(),
  isUsableDetailUri: () => false,
}));

import {
  downloadPreparedExport,
  prepareSelectedPhotosExport,
  toExportError,
} from '../src/lib/export/prepareExport';
import {ExportError} from '../src/lib/export/types';

function photo(id: string, size: number) {
  return {
    photoId: id,
    file: {name: `${id}.jpg`, uri: `file:///src/${id}.jpg`, size},
  } as never;
}

function prepare(photos = [photo('a', 100 * MB)]) {
  return prepareSelectedPhotosExport({
    albumId: 'album-1',
    albumName: 'Album',
    photos,
    quality: 'original',
  });
}

const prepared = {
  path: `${FAKE_STAGING_PATH}/a.zip`,
  stagingPath: `${FAKE_STAGING_PATH}/a.zip`,
  uri: 'file:///a.zip',
  fileName: 'a.zip',
  byteSize: 20 * MB,
  displayPath: 'x',
  photoCount: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockNative.current = makeFakeGumpLocalStorage();
});

describe('prepareSelectedPhotosExport preflight', () => {
  it('throws diskFull before any bake or zip call when staging is low', async () => {
    mockNative.current = makeFakeGumpLocalStorage({disk: 'lowStaging'});
    await expect(prepare()).rejects.toMatchObject({
      reason: 'diskFull',
      requiredBytes: 100 * MB + MARGIN,
    });
    expect(mockBake).not.toHaveBeenCalled();
    expect(mockNative.current.createZipFromEntries).not.toHaveBeenCalled();
    expect(mockNative.current.getFreeDiskSpace).toHaveBeenCalledWith(
      FAKE_STAGING_PATH,
    );
  });

  it('continues and reports when getFreeDiskSpace throws', async () => {
    mockNative.current = makeFakeGumpLocalStorage({disk: 'diskSpaceThrows'});
    await expect(prepare()).resolves.toMatchObject({photoCount: 1});
    expect(mockReportError).toHaveBeenCalledTimes(1);
  });

  it('continues and reports when the module lacks getFreeDiskSpace', async () => {
    const native = makeFakeGumpLocalStorage() as Record<string, unknown>;
    delete native.getFreeDiskSpace;
    mockNative.current = native as never;
    await expect(prepare()).resolves.toMatchObject({photoCount: 1});
    expect(mockReportError).toHaveBeenCalledTimes(1);
  });

  it('reports photos without size once with the count', async () => {
    await prepare([photo('a', 0), photo('b', 0), photo('c', 5 * MB)]);
    const calls = mockReportError.mock.calls.filter(
      ([, ctx]) => ctx?.missingSizeCount != null,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]![1]).toMatchObject({albumId: 'album-1', missingSizeCount: 2});
  });

  it('maps native zip failures after preflight', async () => {
    mockNative.current = makeFakeGumpLocalStorage({export: 'zipSourceMissing'});
    await expect(prepare()).rejects.toMatchObject({
      reason: 'sourceMissing',
      missingCount: 2,
    });
  });
});

describe('downloadPreparedExport preflight', () => {
  it('throws diskFull with ZIP size + margin when destination is low', async () => {
    mockNative.current = makeFakeGumpLocalStorage({disk: 'lowDestination'});
    await expect(downloadPreparedExport({prepared})).rejects.toMatchObject({
      reason: 'diskFull',
      requiredBytes: 20 * MB + MARGIN,
    });
    expect(mockNative.current.getFreeDiskSpace).toHaveBeenCalledWith(
      FAKE_DESTINATION_PATH,
    );
    expect(mockNative.current.copyFile).not.toHaveBeenCalled();
  });

  it('maps E_NOT_WRITABLE from copy', async () => {
    mockNative.current = makeFakeGumpLocalStorage({export: 'copyNotWritable'});
    await expect(downloadPreparedExport({prepared})).rejects.toMatchObject({
      reason: 'folderNotWritable',
    });
  });

  it('continues and reports when getFreeDiskSpace throws', async () => {
    mockNative.current = makeFakeGumpLocalStorage({disk: 'diskSpaceThrows'});
    await expect(downloadPreparedExport({prepared})).resolves.toMatchObject({
      photoCount: 1,
    });
    expect(mockReportError).toHaveBeenCalledTimes(1);
  });
});

describe('toExportError', () => {
  it.each([
    ['E_DISK_FULL', 'diskFull'],
    ['E_NOT_WRITABLE', 'folderNotWritable'],
    ['E_SOURCE_MISSING', 'sourceMissing'],
    ['E_WHATEVER', 'unknown'],
    ['toString', 'unknown'],
    ['__proto__', 'unknown'],
  ])('maps %s to %s', (code, reason) => {
    expect(toExportError(makeNativeError(code)).reason).toBe(reason);
  });

  it('keeps missingCount and cause', () => {
    const cause = makeNativeError('E_SOURCE_MISSING', {missingCount: 3});
    const mapped = toExportError(cause);
    expect(mapped.missingCount).toBe(3);
    expect((mapped as Error & {cause?: unknown}).cause).toBe(cause);
  });

  it('keeps the cause for non-error values and passes ExportError through', () => {
    expect(toExportError('boom')).toMatchObject({
      reason: 'unknown',
      cause: 'boom',
    });
    const existing = new ExportError('diskFull', 'x');
    expect(toExportError(existing)).toBe(existing);
  });
});
