type Photo = {
  starRating: number | null;
  aiSelected: boolean;
  selected: boolean;
  serverUploadStatus?: string;
};
const mockPhotos: Record<string, Photo> = {};
let mockAlbumExists = true;
const mockSetLevel = jest.fn();

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
  setAlbumAiSelectionLevel: (...args: unknown[]) => mockSetLevel(...args),
}));

import { isRecommendedAtLevel } from '@domain/valueObjects/AiSelection';
import type { AiSelectionLevel } from '@domain/valueObjects/AiSelection';
import { applyAiSelectionLevel } from '../src/lib/culling/applyAiSelectionLevel';

const update = async (ids: string[], level: AiSelectionLevel) => {
  ids.forEach(id => {
    mockPhotos[id].aiSelected = isRecommendedAtLevel(
      mockPhotos[id].starRating,
      level,
    );
  });
};

const syncStats = jest.fn();
const persist = jest.fn();

const run = (
  level: AiSelectionLevel,
  updateChunk: (ids: string[], l: AiSelectionLevel) => Promise<void> = update,
) => applyAiSelectionLevel('a', level, updateChunk, syncStats, persist);

const seedRatings = (ratings: Array<number | null>) =>
  ratings.forEach((starRating, i) => {
    mockPhotos[`p${i}`] = {
      starRating,
      aiSelected: false,
      selected: starRating !== null && starRating >= 4,
    };
  });

describe('applyAiSelectionLevel', () => {
  beforeEach(() => {
    Object.keys(mockPhotos).forEach(k => delete mockPhotos[k]);
    mockAlbumExists = true;
    mockSetLevel.mockReset().mockResolvedValue(undefined);
    syncStats.mockReset();
    persist.mockReset().mockResolvedValue(undefined);
  });

  it.each([
    ['fewer', 1],
    ['balanced', 2],
    ['more', 3],
  ] as const)('%s sets aiSelected from stars incl. null/0, returns count', async (level, expected) => {
    seedRatings([5, 4, 3, 2, 1, 0, null]);
    expect(await run(level)).toBe(expected);
    Object.values(mockPhotos).forEach(p =>
      expect(p.aiSelected).toBe(isRecommendedAtLevel(p.starRating, level)),
    );
  });

  it('turns off previously recommended photos and never writes selected', async () => {
    seedRatings([5, 2, 4]);
    mockPhotos.p1.aiSelected = true;
    mockPhotos.p1.selected = false;
    const before = Object.values(mockPhotos).map(p => p.selected);
    expect(await run('fewer')).toBe(1);
    expect(mockPhotos.p1.aiSelected).toBe(false);
    expect(Object.values(mockPhotos).map(p => p.selected)).toEqual(before);
  });

  it('includes uploaded and in-flight photos', async () => {
    seedRatings([5, 5, 5]);
    mockPhotos.p0.serverUploadStatus = 'uploaded';
    mockPhotos.p1.serverUploadStatus = 'uploading';
    expect(await run('balanced')).toBe(3);
  });

  it('saves level once, syncs stats before it, does not persist again', async () => {
    seedRatings(Array.from({ length: 120 }, () => 5));
    const calls: string[] = [];
    syncStats.mockImplementation(() => calls.push('stats'));
    mockSetLevel.mockImplementation(async () => {
      calls.push('level');
    });
    expect(await run('more')).toBe(120);
    expect(mockSetLevel).toHaveBeenCalledTimes(1);
    expect(mockSetLevel).toHaveBeenCalledWith('a', 'more');
    expect(calls).toEqual(['stats', 'level']);
    expect(persist).not.toHaveBeenCalled();
  });

  it('second call cancels the first at the next chunk, no rollback', async () => {
    seedRatings(Array.from({ length: 120 }, () => 5));
    let release!: () => void;
    const gate = new Promise<void>(r => {
      release = r;
    });
    let first = true;
    const slow = async (ids: string[], l: AiSelectionLevel) => {
      await update(ids, l);
      if (first) {
        first = false;
        await gate;
      }
    };
    const a = run('fewer', slow);
    await Promise.resolve();
    await Promise.resolve();
    const b = run('more');
    release();
    await b;
    await a;
    expect(mockPhotos.p0.aiSelected).toBe(true);
    expect(mockSetLevel).toHaveBeenCalledTimes(1);
    expect(mockSetLevel).toHaveBeenCalledWith('a', 'more');
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('failure rejects, leaves level unchanged, persists partial change', async () => {
    seedRatings(Array.from({ length: 120 }, () => 5));
    let n = 0;
    const failing = async (ids: string[], l: AiSelectionLevel) => {
      if (n++ === 1) {
        throw new Error('boom');
      }
      await update(ids, l);
    };
    await expect(run('fewer', failing)).rejects.toThrow('boom');
    expect(mockSetLevel).not.toHaveBeenCalled();
    expect(mockPhotos.p0.aiSelected).toBe(true);
    expect(syncStats).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('level setter failure rejects after photos changed', async () => {
    seedRatings([5]);
    mockSetLevel.mockRejectedValue(new Error('save'));
    await expect(run('fewer')).rejects.toThrow('save');
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('throws before any change for missing album or invalid level', async () => {
    seedRatings([5]);
    mockAlbumExists = false;
    await expect(run('fewer')).rejects.toThrow('Album not found');
    mockAlbumExists = true;
    await expect(run('nope' as AiSelectionLevel)).rejects.toThrow(
      'Invalid ai selection level',
    );
    expect(mockPhotos.p0.aiSelected).toBe(false);
    expect(mockSetLevel).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it('no change needed still saves the level, no stats sync', async () => {
    seedRatings([2]);
    expect(await run('fewer')).toBe(0);
    expect(mockSetLevel).toHaveBeenCalledTimes(1);
    expect(syncStats).not.toHaveBeenCalled();
  });
});
