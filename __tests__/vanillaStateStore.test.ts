import {createVanillaStateStore} from '../src/lib/react/state';
import {
  photoKey,
  photoStateStore,
} from '../src/lib/culledAlbum/photoStateStore';
import {
  flushRenderSync,
  photoRenderStore,
  scheduleRenderSync,
} from '../src/lib/culledAlbum/photoRenderStore';
import {makeCulledAlbumPhoto} from './helpers/fixtures';

afterEach(() => {
  photoStateStore.setState({
    photoState: {},
    photoOrder: {},
    gridRevision: {},
  });
  photoRenderStore.setState({snapshotRevision: 0});
});

describe('createVanillaStateStore', () => {
  it('keeps root identity and skips notify when the updater returns undefined', () => {
    const store = createVanillaStateStore({
      items: {a: {n: 1}, b: {n: 2}} as Record<string, {n: number}>,
    });
    const itemsBefore = store.getState().items;
    let notified = 0;
    const unsubscribe = store.subscribe(() => {
      notified += 1;
    });

    store.setState(state => {
      state.items.a.n = 9;
    });

    unsubscribe();
    expect(store.getState().items).toBe(itemsBefore);
    expect(store.getState().items.a.n).toBe(9);
    expect(notified).toBe(0);
  });

  it('notifies when the updater returns a partial without copying sibling records', () => {
    const store = createVanillaStateStore({
      items: {a: {n: 1}} as Record<string, {n: number}>,
      revision: 0,
    });
    const itemsBefore = store.getState().items;
    let notified = 0;
    const unsubscribe = store.subscribe(() => {
      notified += 1;
    });

    store.setState(state => ({revision: state.revision + 1}));

    unsubscribe();
    expect(store.getState().items).toBe(itemsBefore);
    expect(store.getState().revision).toBe(1);
    expect(notified).toBe(1);
  });
});

describe('photoStateStore vanilla hot path', () => {
  it('mutates a photo in place without replacing the photoState Record', () => {
    const albumId = 'album-1';
    const photo = makeCulledAlbumPhoto({photoId: 'p1', progress: 0});
    const key = photoKey(albumId, photo.photoId);

    photoStateStore.setState({
      photoState: {[key]: photo},
      photoOrder: {[albumId]: [photo.photoId]},
      gridRevision: {},
    });

    const recordBefore = photoStateStore.getState().photoState;
    let notified = 0;
    const unsubscribe = photoStateStore.subscribe(() => {
      notified += 1;
    });

    const live = photoStateStore.getState().photoState[key];
    live!.progress = 40;
    live!.status = 'uploading';

    unsubscribe();
    expect(photoStateStore.getState().photoState).toBe(recordBefore);
    expect(photoStateStore.getState().photoState[key]).toBe(photo);
    expect(photo.progress).toBe(40);
    expect(notified).toBe(0);
  });

  it('still drives UI through photoRenderStore snapshotRevision', () => {
    jest.useFakeTimers();
    const revisions: number[] = [];
    const unsubscribe = photoRenderStore.subscribe(state => {
      revisions.push(state.snapshotRevision);
    });

    scheduleRenderSync();
    expect(photoRenderStore.getState().snapshotRevision).toBe(0);

    jest.advanceTimersByTime(500);
    expect(photoRenderStore.getState().snapshotRevision).toBe(1);

    flushRenderSync();
    expect(photoRenderStore.getState().snapshotRevision).toBe(2);

    unsubscribe();
    jest.useRealTimers();
    expect(revisions).toEqual([1, 2]);
  });
});
