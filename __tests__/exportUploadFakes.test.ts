import {
  FAKE_DESTINATION_PATH,
  FAKE_STAGING_PATH,
  makeCloudStorage,
  makeCurrentUserRefetch,
  makeFakeGumpLocalStorage,
  makeUploadError,
} from './helpers/exportUploadFakes';
import {APIException} from '../src/services/api/exception';

describe('export and upload fakes', () => {
  it('selects disk scenario per path', async () => {
    const fake = makeFakeGumpLocalStorage({disk: 'lowStaging'});
    const staging = await fake.getFreeDiskSpace(FAKE_STAGING_PATH);
    const dest = await fake.getFreeDiskSpace(FAKE_DESTINATION_PATH);
    expect(staging.availableBytes).toBeLessThan(dest.availableBytes);
    await expect(
      makeFakeGumpLocalStorage({disk: 'diskSpaceThrows'}).getFreeDiskSpace('/x'),
    ).rejects.toThrow();
  });

  it('selects export failure scenario', async () => {
    await expect(
      makeFakeGumpLocalStorage({export: 'zipSourceMissing'}).createZipFromEntries(
        [],
        '/z',
      ),
    ).rejects.toMatchObject({
      code: 'E_SOURCE_MISSING',
      userInfo: {missingCount: 2},
    });
    await expect(
      makeFakeGumpLocalStorage({export: 'pickerCancelled'}).pickExportDirectory(),
    ).resolves.toBeNull();
  });

  it('builds upload errors and storage scenarios', async () => {
    const err = makeUploadError('storageGbLimit');
    expect(err).toBeInstanceOf(APIException);
    expect(err.name).toBe('USER_STORAGE_GB_LIMIT');
    expect(makeCloudStorage('unlimited').gbLimit).toBeNull();
    await expect(makeCurrentUserRefetch('refetchFails')()).rejects.toThrow();
    await expect(makeCurrentUserRefetch('nearLimit')()).resolves.toMatchObject({
      data: {details: {storage: {gbUsed: 299.1}}},
    });
  });
});
