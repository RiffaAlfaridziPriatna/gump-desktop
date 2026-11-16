const mockApplyLook = jest.fn(async (..._args: unknown[]) => ({
  uri: 'file:///baked.jpg',
  path: '/baked.jpg',
  size: 1234,
}));

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

import {bakePhotoLook} from '@lib/look/bakeLook';
import {bakeLookPreviewUri} from '@lib/look/bakeLookPreview';
import {resolveLookFinishing} from '@lib/look/lookCatalog';
import {applyLookToJpeg} from '@lib/storage/localStorage';
import {makeCulledAlbumPhoto} from './helpers/fixtures';

const FINISHING_ARG_INDEX = 6;

// Literal copy of the constants the native switch held before s9e
// (GumpLocalStorage.mm applyLookFinishingToImage, GumpLocalStorage.cpp ApplyLookFinishingBgra).
// Native feather was 0..1 (0.75); the wire is 0..100 (75).
const OLD_NATIVE_CONSTANTS = {
  cleanNatural: {
    texture: -5,
    clarity: -5,
    dehaze: 0,
    vignetteAmount: 0,
    vignetteMidpoint: 50,
    vignetteFeather: 75,
    vignetteRoundness: 0,
    grainAmount: 0,
    grainSize: 25,
    grainRoughness: 45,
    warmNudge: 0,
    settleNudge: 0,
    vignetteFrameEllipse: false,
  },
  warmRomantic: {
    texture: -5,
    clarity: -8,
    dehaze: -3,
    vignetteAmount: -8,
    vignetteMidpoint: 45,
    vignetteFeather: 75,
    vignetteRoundness: 0,
    grainAmount: 10,
    grainSize: 25,
    grainRoughness: 45,
    warmNudge: 0.045,
    settleNudge: 0.035,
    vignetteFrameEllipse: false,
  },
  filmMood: {
    texture: -3,
    clarity: 0,
    dehaze: 0,
    vignetteAmount: -30,
    vignetteMidpoint: 40,
    vignetteFeather: 75,
    vignetteRoundness: 0,
    grainAmount: 0,
    grainSize: 25,
    grainRoughness: 45,
    warmNudge: 0,
    settleNudge: 0,
    vignetteFrameEllipse: true,
  },
} as const;

beforeEach(() => mockApplyLook.mockClear());

describe('built-in look finishing values', () => {
  it.each(
    Object.keys(OLD_NATIVE_CONSTANTS) as Array<keyof typeof OLD_NATIVE_CONSTANTS>,
  )('%s equals the old native constants', lookId => {
    expect(resolveLookFinishing(lookId)).toEqual(OLD_NATIVE_CONSTANTS[lookId]);
  });

  it('original and custom have no finishing', () => {
    expect(resolveLookFinishing('original')).toBeUndefined();
    expect(resolveLookFinishing('custom')).toBeUndefined();
  });
});

describe('finishing reaches native applyLook', () => {
  it('photo bake sends the catalog finishing', async () => {
    await bakePhotoLook(
      makeCulledAlbumPhoto({photoId: 'a', lookId: 'warmRomantic'}),
    );
    expect(mockApplyLook.mock.calls[0]?.[FINISHING_ARG_INDEX]).toEqual(
      OLD_NATIVE_CONSTANTS.warmRomantic,
    );
  });

  it('preview bake sends the catalog finishing', async () => {
    await bakeLookPreviewUri('file:///a.jpg', 'filmMood');
    expect(mockApplyLook.mock.calls[0]?.[FINISHING_ARG_INDEX]).toEqual(
      OLD_NATIVE_CONSTANTS.filmMood,
    );
  });

  it('sends null when finishing is missing', async () => {
    await applyLookToJpeg({
      sourceUri: 'file:///a.jpg',
      destPath: '/out.jpg',
      lookId: 'cleanNatural',
      maxPixelSize: 960,
      jpegQuality: 0.88,
    });
    expect(mockApplyLook.mock.calls[0]?.[FINISHING_ARG_INDEX]).toBeNull();
  });
});
