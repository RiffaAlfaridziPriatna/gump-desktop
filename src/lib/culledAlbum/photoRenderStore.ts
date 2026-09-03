import {createStateStore} from '@lib/react/state';

const RENDER_THROTTLE_MS = 500;

export const photoRenderStore = createStateStore<{
  snapshotRevision: number;
}>({
  snapshotRevision: 0,
});

let renderThrottleTimer: ReturnType<typeof setTimeout> | null = null;

function bumpSnapshotRevision(): void {
  photoRenderStore.setState(state => {
    state.snapshotRevision += 1;
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
