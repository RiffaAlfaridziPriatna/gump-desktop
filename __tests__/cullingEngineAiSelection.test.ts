import {
  createCulledAlbumFromSelection,
  createCulledAlbumPhoto,
  type CulledAlbumPhoto,
} from '../src/lib/culledAlbum/types';
import {
  culledAlbumStore,
  flushAllPendingPhotoUpdates,
  getPhotoById,
} from '../src/lib/culledAlbum/store';
import {
  photoKey,
  photoStateStore,
} from '../src/lib/culledAlbum/photoStateStore';
import { cullingEngine } from '../src/lib/culling/cullingEngine';

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
jest.mock('../src/lib/culledAlbum/storage', () => ({
  saveAlbum: jest.fn(),
  removePersistedPhoto: jest.fn(),
}));
jest.mock('../src/lib/culledAlbum/sync', () => ({}));
jest.mock('../src/application/syncPhotoRepository', () => ({
  syncPhotoFromStore: jest.fn(),
  syncPhotosFromStore: jest.fn(),
  clearSyncPhotoFromStore: jest.fn(),
}));
jest.mock('../src/lib/observability/posthogClient', () => ({
  captureAppEvent: jest.fn(),
  captureAppException: jest.fn(),
}));
jest.mock('../src/lib/culledAlbum/photoLoader', () => ({
  ...jest.requireActual('../src/lib/culledAlbum/photoLoader'),
  hydratePhotos: jest.fn(() => []),
}));

const ALBUM = 'album-1';
const STARS: Array<number | null> = [5, 4, 3, 2, null];
const IDS = STARS.map((_, i) => `p${i}`);

beforeEach(() => {
  const photoState: Record<string, CulledAlbumPhoto> = {};
  IDS.forEach((id, i) => {
    photoState[photoKey(ALBUM, id)] = {
      ...createCulledAlbumPhoto(
        { uri: `file:///x/${id}.jpg`, name: id, type: 'image/jpeg', size: 1 },
        id,
      ),
      starRating: STARS[i],
      selected: i === 2,
    };
  });
  photoStateStore.setState(() => ({
    photoState,
    photoOrder: { [ALBUM]: IDS },
  }));
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

const setLevel = (level: 'fewer' | 'balanced' | 'more') =>
  culledAlbumStore.setState(state => {
    state.albums[ALBUM]!.aiSelectionLevel = level;
  });

const ingest = () => {
  cullingEngine.ingestNativeSessionResults(
    ALBUM,
    IDS.map(photoId => ({ photoId, success: true, faces: [] })),
  );
  flushAllPendingPhotoUpdates();
};

const flags = () => IDS.map(id => getPhotoById(ALBUM, id)!.aiSelected);
const picks = () => IDS.map(id => getPhotoById(ALBUM, id)!.selected);

describe('analysis applies the album ai selection level', () => {
  it.each([
    ['fewer', [true, false, false, false, false]],
    ['balanced', [true, true, false, false, false]],
    ['more', [true, true, true, false, false]],
  ] as const)('%s', (level, expected) => {
    setLevel(level);
    ingest();
    expect(flags()).toEqual(expected);
    // picks come from native flags (none here), never from the level
    expect(picks()).toEqual(IDS.map(() => false));
  });

  it('defaults to balanced when the level was never set', () => {
    ingest();
    expect(flags()).toEqual([true, true, false, false, false]);
  });
});

describe('cullingEngine.applyAiSelectionLevel stats', () => {
  it('syncs cullingStats.aiSelected and leaves picks unchanged', async () => {
    ingest();
    culledAlbumStore.setState(state => {
      state.albums[ALBUM]!.cullingStats = {
        totalPhotos: 5,
        mySelections: 1,
        aiSelected: 99,
        maybe: 0,
        blurred: 0,
        closedEyes: 0,
        duplicated: 0,
      };
    });
    const before = picks();
    expect(await cullingEngine.applyAiSelectionLevel(ALBUM, 'more')).toBe(3);
    const album = culledAlbumStore.getState().albums[ALBUM]!;
    expect(album.cullingStats?.aiSelected).toBe(3);
    expect(album.cullingStats?.mySelections).toBe(1);
    expect(album.aiSelectionLevel).toBe('more');
    expect(picks()).toEqual(before);
  });
});
