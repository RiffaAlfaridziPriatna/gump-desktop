import {createStateStore} from '@lib/react/state';
import {CulledAlbumPhoto} from './types';

export type PhotoStateStoreState = {
  photoState: Record<string, CulledAlbumPhoto>;
  photoOrder: Record<string, string[]>;
  gridRevision: Record<string, number>;
};

export const photoKey = (albumId: string, photoId: string): string =>
  `${albumId}:${photoId}`;

export const photoStateStore = createStateStore<PhotoStateStoreState>({
  photoState: {},
  photoOrder: {},
  gridRevision: {},
});

export function bumpPhotoGridRevision(albumId: string): void {
  photoStateStore.setState(state => {
    state.gridRevision[albumId] = (state.gridRevision[albumId] ?? 0) + 1;
  });
}

