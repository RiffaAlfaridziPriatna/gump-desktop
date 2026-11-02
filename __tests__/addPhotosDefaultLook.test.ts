import {
  createCulledAlbumFromSelection,
  createCulledAlbumPhoto,
} from '../src/lib/culledAlbum/types';
import {addPhotosToAlbum, culledAlbumStore} from '../src/lib/culledAlbum/store';
import {
  getPhotosSnapshot,
  photoStateStore,
} from '../src/lib/culledAlbum/photoStateStore';

jest.mock('@lib/navigation/uploadAwareNavigation', () => ({
  shouldDeferHeavyWorkForNavigation: () => false,
  shouldYieldUploadQueueForNavigation: () => false,
  runOrDeferHeavyWorkForNavigation: (fn: () => void) => fn(),
}));
jest.mock('../src/di/container', () => ({
  container: {
    resolve: jest.fn(() => ({
      countByUploadStatus: () => 0,
      sumFileSizeByAlbum: () => 0,
    })),
  },
}));
jest.mock('../src/lib/culledAlbum/storage', () => ({saveAlbum: jest.fn()}));
jest.mock('../src/lib/culledAlbum/sync', () => ({}));
jest.mock('../src/application/syncPhotoRepository', () => ({}));
jest.mock('../src/lib/observability/posthogClient', () => ({
  captureAppEvent: jest.fn(),
  captureAppException: jest.fn(),
}));
jest.mock('../src/lib/culledAlbum/photoLoader', () => ({
  ...jest.requireActual('../src/lib/culledAlbum/photoLoader'),
  hydratePhotos: jest.fn(() => []),
}));

const ALBUM = 'album-1';
const file = (n: string) => ({
  uri: `file:///x/${n}.jpg`,
  name: `${n}.jpg`,
  type: 'image/jpeg',
  size: 1,
});

function seed(defaultLookId: 'original' | 'warmRomantic') {
  photoStateStore.setState(() => ({photoState: {}, photoOrder: {}}));
  // Partial API source: the factory only reads the listed fields.
  const album = createCulledAlbumFromSelection({
    id: ALBUM,
    name: 'a',
    title: null,
    cover: null,
    coverMobile: null,
    link: '',
  } as never);
  album.defaultLookId = defaultLookId;
  culledAlbumStore.setState(state => {
    state.albums = {[ALBUM]: album};
  });
}

describe('addPhotosToAlbum default look', () => {
  it('stamps the album default look', () => {
    seed('warmRomantic');
    const added = addPhotosToAlbum(ALBUM, [file('a'), file('b')]);
    expect(added.map(p => p.lookId)).toEqual(['warmRomantic', 'warmRomantic']);
  });

  it('keeps original when default is original', () => {
    seed('original');
    expect(addPhotosToAlbum(ALBUM, [file('a')])[0]!.lookId).toBe('original');
  });

  it('does not touch earlier photos when the default changes later', () => {
    seed('warmRomantic');
    const first = addPhotosToAlbum(ALBUM, [file('a')])[0]!;
    culledAlbumStore.setState(state => {
      state.albums[ALBUM]!.defaultLookId = 'original';
    });
    const second = addPhotosToAlbum(ALBUM, [file('b')])[0]!;
    const stored = (id: string) =>
      getPhotosSnapshot(ALBUM).find(p => p.photoId === id)!.lookId;
    expect(stored(first.photoId)).toBe('warmRomantic');
    expect(stored(second.photoId)).toBe('original');
  });

  it('createCulledAlbumPhoto defaults to original (sync path)', () => {
    expect(createCulledAlbumPhoto(file('s'), 's').lookId).toBe('original');
  });
});
