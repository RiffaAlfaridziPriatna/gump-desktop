import {
  AI_SELECTION_LEVELS,
  isAiSelectionLevel,
  isRecommendedAtLevel,
} from '../src/domain';
import { CulledAlbum } from '../src/domain/entities/CulledAlbum';
import {
  createCulledAlbumFromSelection,
  normalizePersistedAlbum,
} from '../src/lib/culledAlbum/types';
import { InMemoryAlbumRepository } from './helpers/inMemoryRepos';
import { makeDomainAlbum } from './helpers/fixtures';

const reload = (album: CulledAlbum) =>
  CulledAlbum.fromPlain(JSON.parse(JSON.stringify(album.toPlain())));
const recommended = (level: (typeof AI_SELECTION_LEVELS)[number]) =>
  [5, 4, 3, 2, 1, 0].filter(s => isRecommendedAtLevel(s, level));

describe('isRecommendedAtLevel', () => {
  it('matches the star thresholds per level', () => {
    expect(recommended('fewer')).toEqual([5]);
    expect(recommended('balanced')).toEqual([5, 4]);
    expect(recommended('more')).toEqual([5, 4, 3]);
  });

  it('never recommends unrated photos', () => {
    for (const level of AI_SELECTION_LEVELS) {
      for (const v of [null, undefined, 0, NaN, 2, 1]) {
        expect(isRecommendedAtLevel(v, level)).toBe(false);
      }
    }
  });

  it('each level is a subset of the next', () => {
    expect(
      recommended('fewer').every(s => recommended('balanced').includes(s)),
    ).toBe(true);
    expect(
      recommended('balanced').every(s => recommended('more').includes(s)),
    ).toBe(true);
  });

  it('guards level values', () => {
    expect(isAiSelectionLevel('more')).toBe(true);
    expect(isAiSelectionLevel('nope')).toBe(false);
    expect(isAiSelectionLevel(undefined)).toBe(false);
  });
});

describe('album aiSelectionLevel', () => {
  it('reads balanced when the field is missing', () => {
    const plain = makeDomainAlbum().toPlain();
    delete plain.aiSelectionLevel;
    expect(CulledAlbum.fromPlain(plain).aiSelectionLevel).toBe('balanced');
    expect(
      normalizePersistedAlbum({ ...plain, photos: [] }).aiSelectionLevel,
    ).toBe('balanced');
  });

  it('reads balanced when the stored value is invalid', () => {
    const plain = { ...makeDomainAlbum().toPlain(), aiSelectionLevel: 'nope' };
    expect(CulledAlbum.fromPlain(plain).aiSelectionLevel).toBe('balanced');
    expect(
      normalizePersistedAlbum({ ...plain, photos: [] }).aiSelectionLevel,
    ).toBe('balanced');
    const album = makeDomainAlbum();
    album.setAiSelectionLevel('nope');
    expect(album.aiSelectionLevel).toBe('balanced');
  });

  it('round trips set -> persist -> reload', async () => {
    const repo = new InMemoryAlbumRepository();
    const album = makeDomainAlbum();
    album.setAiSelectionLevel('more');
    await repo.save(reload(album));
    expect(repo.findById('album-1')?.aiSelectionLevel).toBe('more');
    expect(reload(album).toPlain()).toEqual(album.toPlain());
  });

  it('new selection albums start at balanced', () => {
    // Partial API source: the factory only reads the listed fields.
    expect(
      createCulledAlbumFromSelection({
        id: 'a',
        name: 'n',
        title: null,
        cover: {},
        coverMobile: {},
        link: 'l',
      } as never).aiSelectionLevel,
    ).toBe('balanced');
  });
});
