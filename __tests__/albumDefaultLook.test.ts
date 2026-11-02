import {CulledAlbum} from '../src/domain/entities/CulledAlbum';
import {
  createCulledAlbumFromSelection,
  normalizePersistedAlbum,
} from '../src/lib/culledAlbum/types';
import {InMemoryAlbumRepository} from './helpers/inMemoryRepos';
import {makeDomainAlbum} from './helpers/fixtures';

const reload = (album: CulledAlbum) =>
  CulledAlbum.fromPlain(JSON.parse(JSON.stringify(album.toPlain())));

describe('album default look id', () => {
  it('loads legacy JSON without the field as original', () => {
    const plain = makeDomainAlbum().toPlain();
    delete plain.defaultLookId;
    expect(CulledAlbum.fromPlain(plain).defaultLookId).toBe('original');
    expect(normalizePersistedAlbum({...plain, photos: []}).defaultLookId).toBe(
      'original',
    );
  });

  it('loads an unknown id as original', () => {
    const plain = {...makeDomainAlbum().toPlain(), defaultLookId: 'nope'};
    expect(CulledAlbum.fromPlain(plain).defaultLookId).toBe('original');
    expect(normalizePersistedAlbum({...plain, photos: []}).defaultLookId).toBe(
      'original',
    );
    const album = makeDomainAlbum();
    album.setDefaultLookId('nope');
    expect(album.defaultLookId).toBe('original');
  });

  it('round trips set -> persist -> reload', async () => {
    const repo = new InMemoryAlbumRepository();
    const album = makeDomainAlbum();
    album.setDefaultLookId('filmMood');
    await repo.save(reload(album));
    expect(repo.findById('album-1')?.defaultLookId).toBe('filmMood');
    expect(reload(album).toPlain()).toEqual(album.toPlain());
  });

  it('new selection albums start at original', () => {
    // Partial API source: the factory only reads the listed fields.
    expect(
      createCulledAlbumFromSelection({
        id: 'a',
        name: 'n',
        title: null,
        cover: {},
        coverMobile: {},
        link: 'l',
      } as never).defaultLookId,
    ).toBe('original');
  });
});
