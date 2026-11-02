type Photo = { serverUploadStatus?: string; lookId: string };
const mockPhotos: Record<string, Photo> = {};
let mockAlbumExists = true;
const mockSetDefault = jest.fn();

jest.mock('@lib/async/yieldToMain', () => ({
  yieldToMain: () => Promise.resolve(),
}));
jest.mock('@lib/culledAlbum/photoLoader', () => ({
  getPhotoIdsForAlbum: () => Object.keys(mockPhotos),
}));
jest.mock('@lib/culledAlbum/store', () => ({
  ensureAlbumLoaded: jest.fn().mockResolvedValue(undefined),
  getAlbum: () => (mockAlbumExists ? {} : null),
  getPhotoById: (_a: string, id: string) => mockPhotos[id],
  setAlbumDefaultLook: (...args: unknown[]) => mockSetDefault(...args),
}));

import { applyAlbumLook } from '../src/lib/culling/applyAlbumLook';

const update = (lookId: 'original' | 'filmMood') => async (ids: string[]) => {
  ids.forEach(id => {
    mockPhotos[id].lookId = lookId;
  });
};

const seed = (count: number) => {
  for (let i = 0; i < count; i++) {
    mockPhotos[`p${i}`] = { lookId: 'original' };
  }
};

describe('applyAlbumLook', () => {
  beforeEach(() => {
    Object.keys(mockPhotos).forEach(k => delete mockPhotos[k]);
    mockAlbumExists = true;
    mockSetDefault.mockReset().mockResolvedValue(undefined);
  });

  it('allPhotos changes eligible mockPhotos, skips uploaded/pending/uploading, sets default once', async () => {
    seed(120);
    mockPhotos.up = { lookId: 'original', serverUploadStatus: 'uploaded' };
    mockPhotos.pe = { lookId: 'original', serverUploadStatus: 'pending' };
    mockPhotos.ul = { lookId: 'original', serverUploadStatus: 'uploading' };
    const n = await applyAlbumLook(
      'a',
      'filmMood',
      'allPhotos',
      update('filmMood'),
    );
    expect(n).toBe(120);
    expect(mockPhotos.p0.lookId).toBe('filmMood');
    expect(mockPhotos.p119.lookId).toBe('filmMood');
    expect(mockPhotos.up.lookId).toBe('original');
    expect(mockPhotos.pe.lookId).toBe('original');
    expect(mockPhotos.ul.lookId).toBe('original');
    expect(mockSetDefault).toHaveBeenCalledTimes(1);
    expect(mockSetDefault).toHaveBeenCalledWith('a', 'filmMood');
  });

  it('newPhotosOnly changes no photo and sets the default', async () => {
    seed(1);
    const updateChunk = jest.fn();
    expect(
      await applyAlbumLook('a', 'filmMood', 'newPhotosOnly', updateChunk),
    ).toBe(0);
    expect(updateChunk).not.toHaveBeenCalled();
    expect(mockSetDefault).toHaveBeenCalledWith('a', 'filmMood');
  });

  it('second call during the first wins', async () => {
    seed(120);
    const first = applyAlbumLook(
      'a',
      'filmMood',
      'allPhotos',
      update('filmMood'),
    );
    const second = applyAlbumLook(
      'a',
      'original',
      'allPhotos',
      update('original'),
    );
    await Promise.all([first, second]);
    expect(Object.values(mockPhotos).every(p => p.lookId === 'original')).toBe(
      true,
    );
    expect(mockSetDefault).toHaveBeenLastCalledWith('a', 'original');
  });

  it('invalid id throws and changes nothing', async () => {
    seed(1);
    await expect(
      applyAlbumLook('a', 'nope' as never, 'allPhotos', update('filmMood')),
    ).rejects.toThrow('Invalid look id');
    expect(mockSetDefault).not.toHaveBeenCalled();
    expect(mockPhotos.p0.lookId).toBe('original');
  });

  it('unknown album throws and changes nothing', async () => {
    mockAlbumExists = false;
    await expect(
      applyAlbumLook('a', 'filmMood', 'allPhotos', update('filmMood')),
    ).rejects.toThrow('Album not found');
    expect(mockSetDefault).not.toHaveBeenCalled();
  });
});
