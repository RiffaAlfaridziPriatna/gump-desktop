import {createVanillaStateStore} from '@lib/react/state';
import {CulledAlbumPhoto} from './types';

export type PhotoStateStoreState = {
  photoState: Record<string, CulledAlbumPhoto>;
  photoOrder: Record<string, string[]>;
  gridRevision: Record<string, number>;
};

export const photoKey = (albumId: string, photoId: string): string =>
  `${albumId}:${photoId}`;

export const photoStateStore = createVanillaStateStore<PhotoStateStoreState>({
  photoState: {},
  photoOrder: {},
  gridRevision: {},
});

export function getPhotoFromState(
  albumId: string,
  photoId: string,
): CulledAlbumPhoto | undefined {
  return photoStateStore.getState().photoState[photoKey(albumId, photoId)];
}

export function getPhotosSnapshot(albumId: string): CulledAlbumPhoto[] {
  const state = photoStateStore.getState();
  const order = state.photoOrder[albumId];
  if (!order || order.length === 0) {
    return [];
  }

  return order
    .map(photoId => state.photoState[photoKey(albumId, photoId)])
    .filter((photo): photo is CulledAlbumPhoto => Boolean(photo));
}

export function bumpPhotoGridRevision(albumId: string): void {
  photoStateStore.setState(state => ({
    gridRevision: {
      ...state.gridRevision,
      [albumId]: (state.gridRevision[albumId] ?? 0) + 1,
    },
  }));
}

const GRID_REVISION_DEBOUNCE_MS = 300;
const gridRevisionTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleGridRevisionBump(albumId: string): void {
  if (gridRevisionTimers.has(albumId)) {
    return;
  }

  gridRevisionTimers.set(
    albumId,
    setTimeout(() => {
      gridRevisionTimers.delete(albumId);
      bumpPhotoGridRevision(albumId);
    }, GRID_REVISION_DEBOUNCE_MS),
  );
}
