const mockApplyLook = jest.fn(async (..._args: unknown[]) => ({
  uri: 'file:///baked.jpg',
  path: '/baked.jpg',
  size: 1234,
}));
const mockWriteAlbumLookFile = jest.fn(
  async (..._args: unknown[]) => '/root/culling-albums/a1/looks/custom-2.cube',
);
const mockPickLookPresetFile = jest.fn(
  async (): Promise<{uri: string; name: string; size: number} | null> => null,
);

jest.mock('react-native', () => ({
  Platform: {OS: 'macos'},
  NativeModules: {
    GumpLocalStorage: {
      applyLook: (...args: unknown[]) => mockApplyLook(...args),
      writeAlbumLookFile: (...args: unknown[]) => mockWriteAlbumLookFile(...args),
      copyPhoto: jest.fn(),
    },
    GumpFilePicker: {
      pickImages: jest.fn(),
      pickLookPresetFile: () => mockPickLookPresetFile(),
    },
  },
}));
jest.mock('react-native-image-picker', () => ({launchImageLibrary: jest.fn()}));
jest.mock('@lib/media/imageCaptureTime', () => ({parsePickerCaptureTime: jest.fn()}));
jest.mock('@lib/system/platform', () => ({
  isDesktopPlatform: () => true,
  isMobilePlatform: () => false,
}));

import {pickLookPresetFile} from '@lib/media/filePicker';
import {applyLookToJpeg, writeAlbumLookFile} from '@lib/storage/localStorage';

const LUT_PATH_ARG_INDEX = 7;

const bakeOptions = {
  sourceUri: 'file:///a.jpg',
  destPath: '/out.jpg',
  lookId: 'custom',
  maxPixelSize: 960,
  jpegQuality: 0.88,
};

beforeEach(() => {
  mockApplyLook.mockClear();
  mockWriteAlbumLookFile.mockClear();
  mockPickLookPresetFile.mockClear();
});

describe('applyLook lutPath', () => {
  it('passes lutPath to native', async () => {
    await applyLookToJpeg({...bakeOptions, lutPath: '/root/culling-albums/a1/looks/custom-2.cube'});
    expect(mockApplyLook.mock.calls[0]?.[LUT_PATH_ARG_INDEX]).toBe(
      '/root/culling-albums/a1/looks/custom-2.cube',
    );
  });

  it('sends null for built-ins so they bake from the bundled cube', async () => {
    await applyLookToJpeg({...bakeOptions, lookId: 'cleanNatural'});
    expect(mockApplyLook.mock.calls[0]?.[LUT_PATH_ARG_INDEX]).toBeNull();
  });

  it.each(['ELOOK_LUT_MISSING', 'ELOOK_LUT_PARSE', 'EINVAL'])(
    'surfaces native %s rejection',
    async code => {
      mockApplyLook.mockRejectedValueOnce(Object.assign(new Error('x'), {code}));
      await expect(
        applyLookToJpeg({...bakeOptions, lutPath: '/etc/passwd'}),
      ).rejects.toMatchObject({code});
    },
  );
});

describe('writeAlbumLookFile', () => {
  it('passes album id, file name and text through and returns the path', async () => {
    await expect(
      writeAlbumLookFile('a1', 'custom-2.cube', 'LUT_3D_SIZE 2\n'),
    ).resolves.toBe('/root/culling-albums/a1/looks/custom-2.cube');
    expect(mockWriteAlbumLookFile).toHaveBeenCalledWith(
      'a1',
      'custom-2.cube',
      'LUT_3D_SIZE 2\n',
    );
  });

  it('surfaces native EINVAL for an unsafe file name', async () => {
    mockWriteAlbumLookFile.mockRejectedValueOnce(
      Object.assign(new Error('x'), {code: 'EINVAL'}),
    );
    await expect(
      writeAlbumLookFile('a1', '../escape.cube', 'x'),
    ).rejects.toMatchObject({code: 'EINVAL'});
  });
});

describe('pickLookPresetFile', () => {
  it('resolves null on cancel', async () => {
    await expect(pickLookPresetFile()).resolves.toBeNull();
  });

  it('resolves the picked file', async () => {
    const file = {uri: 'file:///p/My Look.xmp', name: 'My Look.xmp', size: 42};
    mockPickLookPresetFile.mockResolvedValueOnce(file);
    await expect(pickLookPresetFile()).resolves.toEqual(file);
  });
});
