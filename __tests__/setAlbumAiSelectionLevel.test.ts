import {
  createCulledAlbumFromSelection,
  createCulledAlbumPhoto,
  type CulledAlbumPhoto,
} from '../src/lib/culledAlbum/types';
import {
  culledAlbumStore,
  setAlbumAiSelectionLevel,
} from '../src/lib/culledAlbum/store';
import {
  photoKey,
  photoStateStore,
} from '../src/lib/culledAlbum/photoStateStore';
import { saveAlbum } from '../src/lib/culledAlbum/storage';

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
jest.mock('../src/lib/culledAlbum/storage', () => ({ saveAlbum: jest.fn() }));
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
const IDS = ['p1', 'p2', 'p3'];

beforeEach(() => {
  jest.clearAllMocks();
  const photoState: Record<string, CulledAlbumPhoto> = {};
  for (const id of IDS) {
    photoState[photoKey(ALBUM, id)] = createCulledAlbumPhoto(
      {
        uri: `file:///x/${id}.jpg`,
        name: `${id}.jpg`,
        type: 'image/jpeg',
        size: 1,
      },
      id,
    );
  }
  photoStateStore.setState(() => ({
    photoState,
    photoOrder: { [ALBUM]: IDS },
  }));
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
    state.albums = { [ALBUM]: album };
  });
});

const aiLevel = () =>
  culledAlbumStore.getState().albums[ALBUM]!.aiSelectionLevel;
const snapshot = () => JSON.parse(JSON.stringify(photoStateStore.getState()));

describe('setAlbumAiSelectionLevel', () => {
  it('sets, persists once and changes no photo', async () => {
    const before = snapshot();
    await setAlbumAiSelectionLevel(ALBUM, 'more');
    expect(aiLevel()).toBe('more');
    expect(saveAlbum).toHaveBeenCalledTimes(1);
    expect((saveAlbum as jest.Mock).mock.calls[0][0].aiSelectionLevel).toBe(
      'more',
    );
    expect(snapshot()).toEqual(before);
  });

  it('falls back to balanced for an unknown id', async () => {
    await setAlbumAiSelectionLevel(ALBUM, 'more');
    await setAlbumAiSelectionLevel(ALBUM, 'nope' as never);
    expect(aiLevel()).toBe('balanced');
  });

  it('ignores an unknown album without saving', async () => {
    await expect(
      setAlbumAiSelectionLevel('missing', 'more'),
    ).resolves.toBeUndefined();
    expect(saveAlbum).not.toHaveBeenCalled();
  });
});
