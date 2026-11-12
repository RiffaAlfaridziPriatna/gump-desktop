import {APIException} from '../../src/services/api/exception';
import {MultipartUploadError} from '../../src/services/upload/multipart';

const GB = 1024 ** 3;
const MB = 1024 ** 2;

export const FAKE_STAGING_PATH = '/fake/staging';
export const FAKE_DESTINATION_PATH = '/fake/exports';

/** Assumed native reject shape: Error with `code` and, for E_SOURCE_MISSING, `userInfo.missingCount`. */
export type FakeNativeError = Error & {
  code: string;
  userInfo?: {missingCount: number};
};

export function makeNativeError(
  code: string,
  extra: {missingCount?: number} = {},
): FakeNativeError {
  const error = new Error(`fake native failure ${code}`) as FakeNativeError;
  error.code = code;
  if (extra.missingCount != null) {
    error.userInfo = {missingCount: extra.missingCount};
  }
  return error;
}

export type FakeDiskScenario =
  | 'plenty'
  | 'lowStaging'
  | 'lowDestination'
  | 'diskSpaceThrows';

export type FakeExportScenario =
  | 'ok'
  | 'zipDiskFull'
  | 'zipSourceMissing'
  | 'copyNotWritable'
  | 'applyLookDiskFull'
  | 'pickerCancelled';

export type FakeLocalStorageOptions = {
  disk?: FakeDiskScenario;
  export?: FakeExportScenario;
  zipByteSize?: number;
};

function freeBytes(disk: FakeDiskScenario, path: string): number {
  if (disk === 'lowStaging' && path === FAKE_STAGING_PATH) return 10 * MB;
  if (disk === 'lowDestination' && path === FAKE_DESTINATION_PATH) {
    return 10 * MB;
  }
  return 500 * GB;
}

/** Fake `NativeModules.GumpLocalStorage` export surface; assign it in the `react-native` mock. */
export function makeFakeGumpLocalStorage(
  options: FakeLocalStorageOptions = {},
) {
  const disk = options.disk ?? 'plenty';
  const scenario = options.export ?? 'ok';
  const byteSize = options.zipByteSize ?? 5 * MB;
  const zipResult = (path: string) => ({
    path,
    uri: `file://${path}`,
    fileName: path.split('/').pop() ?? 'export.zip',
    byteSize,
  });

  return {
    ensureDefaultExportDirectory: jest.fn(async () => ({
      path: FAKE_DESTINATION_PATH,
      displayPath: 'Fake Exports',
    })),
    ensureExportStagingDirectory: jest.fn(async () => ({
      path: FAKE_STAGING_PATH,
      displayPath: 'Fake Staging',
    })),
    pickExportDirectory: jest.fn(async () =>
      scenario === 'pickerCancelled'
        ? null
        : {path: FAKE_DESTINATION_PATH, displayPath: 'Fake Picked'},
    ),
    resolveUniqueZipPath: jest.fn(
      async (directory: string, fileName: string) =>
        `${directory}/${fileName}`,
    ),
    createZipFromEntries: jest.fn(async (_entries: unknown, zipPath: string) => {
      if (scenario === 'zipDiskFull') throw makeNativeError('E_DISK_FULL');
      if (scenario === 'zipSourceMissing') {
        throw makeNativeError('E_SOURCE_MISSING', {missingCount: 2});
      }
      return zipResult(zipPath);
    }),
    copyFile: jest.fn(async (_source: string, destination: string) => {
      if (scenario === 'copyNotWritable') {
        throw makeNativeError('E_NOT_WRITABLE');
      }
      return zipResult(destination);
    }),
    openInFileManager: jest.fn(async () => true),
    getFreeDiskSpace: jest.fn(async (path: string) => {
      if (disk === 'diskSpaceThrows') {
        throw new Error('fake getFreeDiskSpace failure');
      }
      return {availableBytes: freeBytes(disk, path)};
    }),
    applyLook: jest.fn(async () => {
      if (scenario === 'applyLookDiskFull') {
        throw makeNativeError('E_DISK_FULL');
      }
      return {uri: 'file:///fake/baked.jpg', path: '/fake/baked.jpg', size: MB};
    }),
  };
}

export type FakeUploadErrorScenario =
  | 'storageGbLimit'
  | 'dataUsageLimit'
  | 'notFound'
  | 'requestTimeout'
  | 'tooManyRequests'
  | 'serverError'
  | 'multipartNoStatus'
  | 'queueTimeout';

const API_EXCEPTIONS = {
  storageGbLimit: [400, 'USER_STORAGE_GB_LIMIT', 'Not enough storage'],
  dataUsageLimit: [400, 'USER_DATA_USAGE_LIMIT', 'Reached data usage limit'],
  notFound: [404, 'NOT_FOUND', 'Not found'],
  requestTimeout: [408, 'REQUEST_TIMEOUT', 'Request timeout'],
  tooManyRequests: [429, 'TOO_MANY_REQUESTS', 'Too many requests'],
  serverError: [500, 'INTERNAL_SERVER_ERROR', 'Internal server error'],
} as const;

/** Assumed queue timeout shape; align with the real queue error in s5d. */
export function makeQueueTimeoutError(): Error {
  const error = new Error('Upload timed out');
  error.name = 'TimeoutError';
  return error;
}

export function makeUploadError(scenario: FakeUploadErrorScenario): Error {
  if (scenario === 'multipartNoStatus') {
    return new MultipartUploadError({attempts: 3, category: 'network'});
  }
  if (scenario === 'queueTimeout') return makeQueueTimeoutError();
  const [status, name, message] = API_EXCEPTIONS[scenario];
  return new APIException(status, name, message, undefined);
}

export type FakeCloudStorageScenario =
  | 'normal'
  | 'nearLimit'
  | 'exceeded'
  | 'unlimited'
  | 'refetchFails';

export type FakeStorageDto = {
  gbUsed: number;
  gbLimit: number | null;
  gbExtra: number;
};

const CLOUD_STORAGE: Record<
  Exclude<FakeCloudStorageScenario, 'refetchFails'>,
  FakeStorageDto
> = {
  normal: {gbUsed: 120.4, gbLimit: 300, gbExtra: 0},
  nearLimit: {gbUsed: 299.1, gbLimit: 300, gbExtra: 0},
  exceeded: {gbUsed: 4.8, gbLimit: 5, gbExtra: 0},
  unlimited: {gbUsed: 42.5, gbLimit: null, gbExtra: 0},
};

/** `storage` slice of the current-user DTO. `refetchFails` has none; use `makeCurrentUserRefetch`. */
export function makeCloudStorage(
  scenario: Exclude<FakeCloudStorageScenario, 'refetchFails'>,
): FakeStorageDto {
  return {...CLOUD_STORAGE[scenario]};
}

/** Fake current-user refetch: resolves `{storage}` or rejects for `refetchFails`. */
export function makeCurrentUserRefetch(scenario: FakeCloudStorageScenario) {
  return jest.fn(async () => {
    if (scenario === 'refetchFails') {
      throw new Error('fake current-user refetch failure');
    }
    return {data: {details: {storage: makeCloudStorage(scenario)}}};
  });
}
