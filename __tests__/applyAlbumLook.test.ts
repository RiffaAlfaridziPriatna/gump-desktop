type Look = 'original' | 'cleanNatural' | 'warmRomantic' | 'filmMood';
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

const update = (lookId: Look) => async (ids: string[]) => {
  ids.forEach(id => {
    mockPhotos[id].lookId = lookId;
  });
};

const seed = (count: number) => {
  for (let i = 0; i < count; i++) {
    mockPhotos[`p${i}`] = { lookId: 'cleanNatural' };
  }
};

const persist = jest.fn();

const run = (
  lookId: Look,
  scope: 'allPhotos' | 'newPhotosOnly',
  updateChunk: (ids: string[]) => Promise<void> = update(lookId),
) => applyAlbumLook('a', lookId, scope, updateChunk, persist);

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(r => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('applyAlbumLook', () => {
  beforeEach(() => {
    Object.keys(mockPhotos).forEach(k => delete mockPhotos[k]);
    mockAlbumExists = true;
    mockSetDefault.mockReset().mockResolvedValue(undefined);
    persist.mockReset().mockResolvedValue(undefined);
  });

  it('allPhotos changes eligible photos, skips uploaded/pending/uploading, sets default once', async () => {
    seed(120);
    mockPhotos.up = { lookId: 'cleanNatural', serverUploadStatus: 'uploaded' };
    mockPhotos.pe = { lookId: 'cleanNatural', serverUploadStatus: 'pending' };
    mockPhotos.ul = { lookId: 'cleanNatural', serverUploadStatus: 'uploading' };
    expect(await run('filmMood', 'allPhotos')).toBe(120);
    expect(mockPhotos.p0.lookId).toBe('filmMood');
    expect(mockPhotos.p119.lookId).toBe('filmMood');
    expect(mockPhotos.up.lookId).toBe('cleanNatural');
    expect(mockPhotos.pe.lookId).toBe('cleanNatural');
    expect(mockPhotos.ul.lookId).toBe('cleanNatural');
    expect(mockSetDefault).toHaveBeenCalledTimes(1);
    expect(mockSetDefault).toHaveBeenCalledWith('a', 'filmMood');
  });

  it('includes hand-edited photos and counts only photos whose look changed', async () => {
    seed(2);
    mockPhotos.p0.lookId = 'warmRomantic';
    mockPhotos.p1.lookId = 'filmMood';
    expect(await run('filmMood', 'allPhotos')).toBe(1);
    expect(mockPhotos.p0.lookId).toBe('filmMood');
  });

  it('persists once per run, not per chunk', async () => {
    seed(120);
    await run('filmMood', 'allPhotos');
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('respects an upload that starts between chunks', async () => {
    seed(120);
    const n = await run('filmMood', 'allPhotos', async ids => {
      await update('filmMood')(ids);
      mockPhotos.p60.serverUploadStatus = 'uploading';
    });
    expect(n).toBe(119);
    expect(mockPhotos.p60.lookId).toBe('cleanNatural');
  });

  it('newPhotosOnly changes no photo and sets the default', async () => {
    seed(1);
    const updateChunk = jest.fn();
    expect(await run('filmMood', 'newPhotosOnly', updateChunk)).toBe(0);
    expect(updateChunk).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
    expect(mockSetDefault).toHaveBeenCalledWith('a', 'filmMood');
  });

  it('second call cancels the first at its next chunk and wins', async () => {
    seed(120);
    const chunk1Done = deferred();
    const gate = deferred();
    let calls = 0;
    const first = run('filmMood', 'allPhotos', async ids => {
      await update('filmMood')(ids);
      if (++calls === 1) {
        chunk1Done.resolve();
        await gate.promise;
      }
    });
    await chunk1Done.promise;
    const second = run('warmRomantic', 'allPhotos');
    gate.resolve();
    expect(await first).toBe(50);
    expect(calls).toBe(1);
    expect(await second).toBe(120);
    expect(
      Object.values(mockPhotos).every(p => p.lookId === 'warmRomantic'),
    ).toBe(true);
    expect(mockSetDefault).toHaveBeenLastCalledWith('a', 'warmRomantic');
  });

  it('allPhotos then newPhotosOnly keeps the first call changes and the second default', async () => {
    seed(120);
    const chunk1Done = deferred();
    const gate = deferred();
    const first = run('filmMood', 'allPhotos', async ids => {
      await update('filmMood')(ids);
      chunk1Done.resolve();
      await gate.promise;
    });
    await chunk1Done.promise;
    const second = run('warmRomantic', 'newPhotosOnly');
    gate.resolve();
    expect(await first).toBe(50);
    expect(await second).toBe(0);
    expect(mockPhotos.p0.lookId).toBe('filmMood');
    expect(mockPhotos.p50.lookId).toBe('cleanNatural');
    expect(mockSetDefault).toHaveBeenLastCalledWith('a', 'warmRomantic');
  });

  it('persists what changed and clears state when a chunk throws', async () => {
    seed(120);
    let calls = 0;
    await expect(
      run('filmMood', 'allPhotos', async ids => {
        if (++calls === 2) {
          throw new Error('boom');
        }
        await update('filmMood')(ids);
      }),
    ).rejects.toThrow('boom');
    expect(persist).toHaveBeenCalledTimes(1);
    expect(mockPhotos.p0.lookId).toBe('filmMood');
    // a later run is not treated as cancelled by stale state
    expect(await run('warmRomantic', 'allPhotos')).toBe(120);
  });

  it('invalid id throws and changes nothing', async () => {
    seed(1);
    await expect(run('nope' as never, 'allPhotos')).rejects.toThrow(
      'Invalid look id',
    );
    expect(mockSetDefault).not.toHaveBeenCalled();
    expect(mockPhotos.p0.lookId).toBe('cleanNatural');
  });

  it('unknown album throws and changes nothing', async () => {
    mockAlbumExists = false;
    await expect(run('filmMood', 'allPhotos')).rejects.toThrow(
      'Album not found',
    );
    expect(mockSetDefault).not.toHaveBeenCalled();
  });
});
