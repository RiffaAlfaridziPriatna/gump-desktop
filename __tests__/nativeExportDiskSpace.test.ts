import {ExportError} from '../src/lib/export/types';

const mockGetFreeDiskSpace = jest.fn();

jest.mock('react-native', () => ({
  Platform: {OS: 'macos'},
  NativeModules: {
    GumpLocalStorage: {
      createZipFromEntries: jest.fn(),
      ensureDefaultExportDirectory: jest.fn(),
      ensureExportStagingDirectory: jest.fn(),
      copyFile: jest.fn(),
      getFreeDiskSpace: (...args: unknown[]) => mockGetFreeDiskSpace(...args),
    },
  },
}));

import {getFreeDiskSpace} from '../src/lib/export/nativeExport';

describe('getFreeDiskSpace', () => {
  it('returns a valid native result', async () => {
    mockGetFreeDiskSpace.mockResolvedValue({availableBytes: 42});
    await expect(getFreeDiskSpace('/x')).resolves.toEqual({availableBytes: 42});
  });

  it.each([{availableBytes: Number.NaN}, {availableBytes: -1}, {}, null])(
    'throws ExportError for invalid result %p',
    async result => {
      mockGetFreeDiskSpace.mockResolvedValue(result);
      await expect(getFreeDiskSpace('/x')).rejects.toBeInstanceOf(ExportError);
    },
  );
});
