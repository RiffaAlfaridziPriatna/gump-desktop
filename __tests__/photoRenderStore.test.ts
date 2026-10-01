import {
  flushRenderSync,
  isRenderSyncPaused,
  pauseRenderSync,
  resumeRenderSync,
  scheduleRenderSync,
  photoRenderStore,
} from '../src/lib/culledAlbum/photoRenderStore';

describe('photoRenderStore pause', () => {
  beforeEach(() => {
    while (isRenderSyncPaused()) {
      resumeRenderSync({flush: false});
    }
    jest.useFakeTimers();
    flushRenderSync();
  });

  afterEach(() => {
    while (isRenderSyncPaused()) {
      resumeRenderSync({flush: false});
    }
    jest.useRealTimers();
  });

  it('defers snapshotRevision bumps until resume flush', () => {
    const before = photoRenderStore.getState().snapshotRevision;

    pauseRenderSync();
    scheduleRenderSync();
    scheduleRenderSync();
    jest.advanceTimersByTime(1000);

    expect(photoRenderStore.getState().snapshotRevision).toBe(before);

    resumeRenderSync({flush: true});
    expect(photoRenderStore.getState().snapshotRevision).toBe(before + 1);
  });

  it('allows flushRenderSync while paused', () => {
    const before = photoRenderStore.getState().snapshotRevision;
    pauseRenderSync();
    flushRenderSync();
    expect(photoRenderStore.getState().snapshotRevision).toBe(before + 1);
    resumeRenderSync({flush: false});
  });
});
