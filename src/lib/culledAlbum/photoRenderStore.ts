import {createVanillaStateStore} from '@lib/react/state';
import {gumpPerfMark} from './perfDebug';

const RENDER_THROTTLE_MS = 500;

export const photoRenderStore = createVanillaStateStore<{
  snapshotRevision: number;
}>({
  snapshotRevision: 0,
});

let renderThrottleTimer: ReturnType<typeof setTimeout> | null = null;

function bumpSnapshotRevision(): void {
  photoRenderStore.setState(state => ({
    snapshotRevision: state.snapshotRevision + 1,
  }));
  gumpPerfMark('snapshotRevision', {
    revision: photoRenderStore.getState().snapshotRevision,
  });
}

export function scheduleRenderSync(): void {
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
  bumpSnapshotRevision();
}
