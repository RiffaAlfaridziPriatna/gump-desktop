import {createVanillaStateStore} from '@lib/react/state';

/**
 * Per-photo UI version map. Cells subscribe to a single key so field updates
 * (select/star/uri) re-render only that card — no O(N) EventEmitter listeners.
 */
export const photoVersionStore = createVanillaStateStore<{
  versions: Record<string, number>;
}>({
  versions: {},
});

export function bumpPhotoVersion(photoKey: string): void {
  photoVersionStore.setState(state => ({
    versions: {
      ...state.versions,
      [photoKey]: (state.versions[photoKey] ?? 0) + 1,
    },
  }));
}

export function bumpPhotoVersions(photoKeys: string[]): void {
  if (photoKeys.length === 0) {
    return;
  }
  photoVersionStore.setState(state => {
    const versions = {...state.versions};
    for (const key of photoKeys) {
      versions[key] = (versions[key] ?? 0) + 1;
    }
    return {versions};
  });
}

export function getPhotoVersion(photoKey: string): number {
  return photoVersionStore.getState().versions[photoKey] ?? 0;
}
