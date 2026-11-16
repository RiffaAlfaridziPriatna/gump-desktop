const mockApplyLook = jest.fn(async (..._args: unknown[]) => ({
  uri: 'file:///baked.jpg',
  path: '/baked.jpg',
  size: 1234,
}));

jest.mock('react-native', () => ({
  Platform: {OS: 'macos'},
  NativeModules: {GumpLocalStorage: {applyLook: (...args: unknown[]) => mockApplyLook(...args), copyPhoto: jest.fn()}},
}));
jest.mock('@lib/export/nativeExport', () => ({
  ensureExportStagingDirectory: async () => ({path: '/staging'}),
}));

import {CulledPhoto} from '@/domain/entities/CulledPhoto';
import {
  domainPhotoToLegacy,
  legacyPhotoToDomain,
} from '@lib/culledAlbum/photoMapper';
import {bakePhotoLook, lookDetailCacheKey} from '@lib/look/bakeLook';
import {bakeLookPreviewUri} from '@lib/look/bakeLookPreview';
import {LOOK_BAKE_INTENSITY} from '@lib/look/types';
import {makeCulledAlbumPhoto, makeUploadFile} from './helpers/fixtures';

const INTENSITY_ARG_INDEX = 3;

beforeEach(() => mockApplyLook.mockClear());

describe('fixed look bake intensity', () => {
  it('is 100', () => {
    expect(LOOK_BAKE_INTENSITY).toBe(100);
  });

  it('sends 100 to native for photo bakes', async () => {
    const photo = makeCulledAlbumPhoto({photoId: 'a', lookId: 'filmMood'});
    await bakePhotoLook(photo, 'compressed');
    expect(mockApplyLook.mock.calls[0]?.[INTENSITY_ARG_INDEX]).toBe(100);
  });

  it('sends 100 to native for preview bakes', async () => {
    await bakeLookPreviewUri('file:///a.jpg', 'warmRomantic');
    expect(mockApplyLook.mock.calls[0]?.[INTENSITY_ARG_INDEX]).toBe(100);
  });

  it('cache key differs from the key written when intensity was 80', () => {
    const oldKey = 'warmRomantic|80|4096';
    expect(lookDetailCacheKey('warmRomantic')).toBe('warmRomantic|100|4096');
    expect(lookDetailCacheKey('warmRomantic')).not.toBe(oldKey);
  });
});

describe('persisted lookIntensity', () => {
  const persisted = {
    photoId: 'p1',
    file: makeUploadFile({name: 'p1.jpg'}),
    lookId: 'cleanNatural',
    lookIntensity: 80,
  };

  it('loads old JSON without error and does not write the field back', () => {
    const photo = CulledPhoto.fromPlain('album-1', persisted as never);
    expect(photo.lookId).toBe('cleanNatural');
    expect(photo.toPlain()).not.toHaveProperty('lookIntensity');
    expect(domainPhotoToLegacy(photo)).not.toHaveProperty('lookIntensity');
  });

  it('round-trips legacy store photos without the field', () => {
    const legacy = {
      ...makeCulledAlbumPhoto({photoId: 'p2', lookId: 'filmMood'}),
      lookIntensity: 80,
    };
    const plain = legacyPhotoToDomain(legacy, 'album-1').toPlain();
    expect(plain).not.toHaveProperty('lookIntensity');
  });
});
