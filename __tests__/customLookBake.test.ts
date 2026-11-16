const mockApplyLook = jest.fn(async (..._args: unknown[]) => ({
  uri: 'file:///baked.jpg',
  path: '/baked.jpg',
  size: 1234,
}));
const mockReportError = jest.fn();

jest.mock('react-native', () => ({
  Platform: {OS: 'macos'},
  NativeModules: {
    GumpLocalStorage: {
      applyLook: (...args: unknown[]) => mockApplyLook(...args),
      copyPhoto: jest.fn(),
    },
  },
}));
jest.mock('@lib/export/nativeExport', () => ({
  ensureExportStagingDirectory: async () => ({path: '/staging'}),
}));
jest.mock('@lib/observability/reportError', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

import {
  bakePhotoLook,
  isLookDetailCurrent,
  lookDetailCacheKey,
  resolveBakeDestinationPath,
  type CustomLookSource,
} from '@lib/look/bakeLook';
import {bakeLookPreviewUri} from '@lib/look/bakeLookPreview';
import {customLookFilePath} from '@lib/look/customLookFile';
import {parseLookFinishing} from '@domain/valueObjects/LookFinishing';
import {makeCulledAlbumPhoto} from './helpers/fixtures';

const ALBUM = 'album-1';
const PHOTO_URI = 'file:///Users/me/Gump/culling-albums/album-1/p1.jpg';
const LUT_ARG = 7;
const FINISHING_ARG = 6;

function source(revision: string | null): CustomLookSource {
  return {
    albumId: ALBUM,
    customLook: revision
      ? {
          name: 'My preset',
          revision,
          finishing: parseLookFinishing({clarity: 20, vignetteAmount: -30}),
        }
      : null,
  };
}

function customPhoto() {
  const photo = makeCulledAlbumPhoto({photoId: 'p1', lookId: 'custom'});
  return {...photo, file: {...photo.file, uri: PHOTO_URI}};
}

beforeEach(() => jest.clearAllMocks());

describe('custom look cache keys', () => {
  it('keeps built-in keys and bake file names unchanged', async () => {
    expect(lookDetailCacheKey('filmMood')).toBe('filmMood|100|4096');
    expect(lookDetailCacheKey('filmMood', 'r1')).toBe('filmMood|100|4096');
    const photo = makeCulledAlbumPhoto({photoId: 'p1', lookId: 'filmMood'});
    await expect(resolveBakeDestinationPath(photo, 'original', 'r1')).resolves.toBe(
      '/staging/looks/p1-filmMood-100-12000.jpg',
    );
  });

  it('changes custom keys when the revision changes', async () => {
    expect(lookDetailCacheKey('custom', 'r1')).not.toBe(
      lookDetailCacheKey('custom', 'r2'),
    );
    const file = {lookDetailUri: 'file:///d.jpg', lookDetailKey: lookDetailCacheKey('custom', 'r1')};
    expect(isLookDetailCurrent(file, 'custom', 'r1')).toBe(true);
    expect(isLookDetailCurrent(file, 'custom', 'r2')).toBe(false);
    expect(isLookDetailCurrent(file, 'custom')).toBe(false);
    await expect(
      resolveBakeDestinationPath(customPhoto(), 'original', 'r2'),
    ).resolves.toBe('/staging/looks/p1-custom-r2-100-12000.jpg');
  });
});

describe('bakePhotoLook custom', () => {
  it('bakes from the album preset file with its finishing', async () => {
    await bakePhotoLook(customPhoto(), 'original', source('r1'));
    const args = mockApplyLook.mock.calls[0]!;
    expect(args[2]).toBe('custom');
    expect(args[LUT_ARG]).toBe(
      '/Users/me/Gump/culling-albums/album-1/looks/custom-r1.cube',
    );
    expect(args[FINISHING_ARG]).toMatchObject({
      clarity: 20,
      vignetteAmount: -30,
      vignetteFrameEllipse: true,
      warmNudge: 0,
    });
    expect(args[1]).toBe('/staging/looks/p1-custom-r1-100-12000.jpg');
  });

  it('sends no finishing when the preset has none', async () => {
    const custom = source('r1');
    await bakePhotoLook(customPhoto(), 'original', {
      ...custom,
      customLook: {...custom.customLook!, finishing: null},
    });
    expect(mockApplyLook.mock.calls[0]![FINISHING_ARG]).toBeNull();
  });

  it.each([
    ['no preset', source(null)],
    ['no source', undefined],
  ])('bakes as original and reports with %s', async (_label, custom) => {
    const photo = customPhoto();
    const result = await bakePhotoLook(photo, 'original', custom);
    expect(result).toEqual({photoId: 'p1', uri: PHOTO_URI, size: photo.file.size});
    expect(mockApplyLook).not.toHaveBeenCalled();
    expect(mockReportError).toHaveBeenCalledTimes(1);
  });

  it('sends no lutPath for a built-in', async () => {
    await bakePhotoLook(
      makeCulledAlbumPhoto({photoId: 'p1', lookId: 'filmMood'}),
      'original',
      source('r1'),
    );
    expect(mockApplyLook.mock.calls[0]![LUT_ARG]).toBeNull();
  });
});

describe('bakeLookPreviewUri custom', () => {
  it('bakes a revision-keyed preview and shows the original without a preset', async () => {
    const thumb = 'file:///Users/me/Gump/culling-albums/album-1/thumbs/p1.v4.jpg';
    await bakeLookPreviewUri(thumb, 'custom', source('r9'));
    expect(mockApplyLook.mock.calls[0]![LUT_ARG]).toBe(
      '/Users/me/Gump/culling-albums/album-1/looks/custom-r9.cube',
    );
    expect(String(mockApplyLook.mock.calls[0]![1])).toContain('-custom-r9-');
    await expect(bakeLookPreviewUri(thumb, 'custom', source(null))).resolves.toBe(
      thumb,
    );
    expect(mockApplyLook).toHaveBeenCalledTimes(1);
  });
});

describe('customLookFilePath', () => {
  it('derives the path on macOS and Windows', () => {
    expect(customLookFilePath(PHOTO_URI, ALBUM, 'r1')).toBe(
      '/Users/me/Gump/culling-albums/album-1/looks/custom-r1.cube',
    );
    expect(
      customLookFilePath(
        'file:///C:/Users/me/AppData/Local/Gump/culling-albums/album-1/p1.jpg',
        ALBUM,
        'r1',
      ),
    ).toBe('C:/Users/me/AppData/Local/Gump/culling-albums/album-1/looks/custom-r1.cube');
    expect(
      customLookFilePath('C:\\Gump\\culling-albums\\album-1\\details\\p1.jpg', ALBUM, 'r1'),
    ).toBe('C:/Gump/culling-albums/album-1/looks/custom-r1.cube');
  });

  it('returns null outside the album folder', () => {
    expect(customLookFilePath('file:///tmp/p1.jpg', ALBUM, 'r1')).toBeNull();
    expect(
      customLookFilePath('file:///x/culling-albums/album-10/p1.jpg', ALBUM, 'r1'),
    ).toBeNull();
  });
});
