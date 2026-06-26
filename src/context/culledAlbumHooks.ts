import {useContextOrThrow} from '@lib/context';
import {culledAlbumStore} from '@lib/culledAlbum/store';
import {getServerUploadBatchPhotos} from '@lib/culledAlbum/serverUploadProgress';
import {CulledAlbumPhoto, sortPhotosByUploadedAt} from '@lib/culledAlbum/types';
import {useStateStore} from '@lib/state';
import {useMemo} from 'react';
import {
  CulledAlbumActionsContext,
  CulledAlbumUiContext,
  type CulledAlbumUiState,
} from './culledAlbumContext';

const EMPTY_PHOTO_IDS: string[] = [];
const EMPTY_PHOTOS: CulledAlbumPhoto[] = [];

export function useCulledAlbumUiState<R = CulledAlbumUiState>(
  selector?: (state: CulledAlbumUiState) => R,
): R {
  return useStateStore(useContextOrThrow(CulledAlbumUiContext), selector);
}

export function useCulledAlbumActions() {
  return useContextOrThrow(CulledAlbumActionsContext);
}

export function useCulledAlbumStore<R>(
  selector: (state: ReturnType<typeof culledAlbumStore.getState>) => R,
): R {
  return useStateStore(culledAlbumStore, selector);
}

export function useCulledAlbumPhotosState(albumId: string): CulledAlbumPhoto[] {
  const photos = useCulledAlbumStore(
    state => state.albums[albumId]?.photos ?? EMPTY_PHOTOS,
  );
  return useMemo(() => sortPhotosByUploadedAt(photos), [photos]);
}

export function useCulledAlbumUploadItems(albumId: string | null) {
  return useCulledAlbumStore(state => {
    if (!albumId) {
      return EMPTY_PHOTOS;
    }
    return state.albums[albumId]?.photos ?? EMPTY_PHOTOS;
  });
}

export function useCulledAlbumServerUploadBatch(albumId: string) {
  const batchPhotoIds = useCulledAlbumStore(
    state => state.albums[albumId]?.uploadBatchPhotoIds ?? EMPTY_PHOTO_IDS,
  );
  const albumPhotos = useCulledAlbumStore(
    state => state.albums[albumId]?.photos ?? EMPTY_PHOTOS,
  );

  return useMemo(() => {
    if (batchPhotoIds.length === 0) {
      return {batchPhotoIds: EMPTY_PHOTO_IDS, photos: EMPTY_PHOTOS};
    }

    return {
      batchPhotoIds,
      photos: getServerUploadBatchPhotos(albumPhotos, batchPhotoIds),
    };
  }, [albumPhotos, batchPhotoIds]);
}

export function useCulledAlbumAnalyzeItems(albumId: string | null) {
  const photos = useCulledAlbumStore(state => {
    if (!albumId) {
      return EMPTY_PHOTOS;
    }
    return state.albums[albumId]?.photos ?? EMPTY_PHOTOS;
  });

  return useMemo(
    () => photos.filter(photo => photo.analysisStatus !== 'idle'),
    [photos],
  );
}
