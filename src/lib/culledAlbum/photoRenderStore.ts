import {createVanillaStateStore} from '@lib/react/state';
import {gumpPerfMark} from './perfDebug';

const RENDER_THROTTLE_MS = 500;

export const photoRenderStore = createVanillaStateStore<{
  snapshotRevision: number;
}>({
  snapshotRevision: 0,
});

let renderThrottleTimer: ReturnType<typeof setTimeout> | null = null;
let renderSyncPauseDepth = 0;
let renderSyncDirtyWhilePaused = false;

function bumpSnapshotRevision(): void {
  photoRenderStore.setState(state => ({
    snapshotRevision: state.snapshotRevision + 1,
  }));
  gumpPerfMark('snapshotRevision', {
    revision: photoRenderStore.getState().snapshotRevision,
  });
}

/**
 * While paused, scheduleRenderSync coalesces into a single flush on resume.
 * Used on Windows during analysis so AlbumDetail PhotoGrid cells do not
 * re-render on every ingested analysis result (URI is unchanged).
 */
export function pauseRenderSync(): void {
  renderSyncPauseDepth += 1;
}

export function resumeRenderSync(options?: {flush?: boolean}): void {
  if (renderSyncPauseDepth > 0) {
    renderSyncPauseDepth -= 1;
  }
  if (renderSyncPauseDepth > 0) {
    return;
  }

  const shouldFlush = options?.flush !== false && renderSyncDirtyWhilePaused;
  renderSyncDirtyWhilePaused = false;
  if (shouldFlush) {
    flushRenderSync();
  }
}

export function isRenderSyncPaused(): boolean {
  return renderSyncPauseDepth > 0;
}

export function scheduleRenderSync(): void {
  if (renderSyncPauseDepth > 0) {
    renderSyncDirtyWhilePaused = true;
    return;
  }

  if (renderThrottleTimer) {
    return;
  }

  renderThrottleTimer = setTimeout(() => {
    renderThrottleTimer = null;
    bumpSnapshotRevision();
  }, RENDER_THROTTLE_MS);
}

export function flushRenderSync(): void {
  if (renderThrottleTimer) {
    clearTimeout(renderThrottleTimer);
    renderThrottleTimer = null;
  }
  renderSyncDirtyWhilePaused = false;
  bumpSnapshotRevision();
}
