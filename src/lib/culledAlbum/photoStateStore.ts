import {createStateStore} from '@lib/react/state';
import {CulledAlbumPhoto} from './types';

export type PhotoStateStoreState = {
  photoState: Record<string, CulledAlbumPhoto>;
  photoOrder: Record<string, string[]>;
};

export const photoKey = (albumId: string, photoId: string): string =>
  `${albumId}:${photoId}`;

export const photoStateStore = createStateStore<PhotoStateStoreState>({
  photoState: {},
  photoOrder: {},
});

