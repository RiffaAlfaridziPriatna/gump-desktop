import {
  createCulledAlbumFromSelection,
  normalizePersistedAlbum,
} from '../src/lib/culledAlbum/types';
import {
  culledAlbumStore,
  setAlbumCustomLook,
} from '../src/lib/culledAlbum/store';
import {saveAlbum} from '../src/lib/culledAlbum/storage';
import type {CustomLook} from '../src/lib/look/types';

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

const ALBUM = 'album-1';
const FIRST: CustomLook = {name: 'One', revision: 'r1', finishing: null};
const SECOND: CustomLook = {name: 'Two', revision: 'r2', finishing: null};
const customLook = () => culledAlbumStore.getState().albums[ALBUM]!.customLook;

beforeEach(() => {
  jest.clearAllMocks();
  // Partial API source: the factory only reads the listed fields.
  const album = createCulledAlbumFromSelection({
    id: ALBUM,
    name: 'a',
    title: null,
    cover: null,
    coverMobile: null,
    link: '',
  } as never);
  culledAlbumStore.setState(state => {
    state.albums = {[ALBUM]: album};
  });
});

describe('setAlbumCustomLook', () => {
  it('replaces the preset, persists and returns the previous one', async () => {
    await expect(setAlbumCustomLook(ALBUM, FIRST)).resolves.toBeNull();
    await expect(setAlbumCustomLook(ALBUM, SECOND)).resolves.toEqual(FIRST);
    expect(customLook()).toEqual(SECOND);
    expect((saveAlbum as jest.Mock).mock.calls[1][0].customLook).toEqual(SECOND);
  });

  it('restores the previous preset when persisting fails', async () => {
    await setAlbumCustomLook(ALBUM, FIRST);
    (saveAlbum as jest.Mock).mockImplementationOnce(() => {
      throw new Error('sqlite');
    });
    await expect(setAlbumCustomLook(ALBUM, SECOND)).rejects.toThrow('sqlite');
    expect(customLook()).toEqual(FIRST);
  });

  it('rejects an unknown album', async () => {
    await expect(setAlbumCustomLook('missing', FIRST)).rejects.toThrow(
      'Album not found',
    );
    expect(saveAlbum).not.toHaveBeenCalled();
  });
});

describe('normalizePersistedAlbum customLook', () => {
  it('reads a missing or malformed preset as null', () => {
    const album = createCulledAlbumFromSelection({
      id: ALBUM,
      name: 'a',
      title: null,
      cover: null,
      coverMobile: null,
      link: '',
    } as never);
    expect(normalizePersistedAlbum({...album}).customLook).toBeNull();
    expect(
      normalizePersistedAlbum({
        ...album,
        customLook: {name: 'x', revision: '../x', finishing: null},
      }).customLook,
    ).toBeNull();
    expect(
      normalizePersistedAlbum({...album, customLook: FIRST}).customLook,
    ).toEqual(FIRST);
  });
});
