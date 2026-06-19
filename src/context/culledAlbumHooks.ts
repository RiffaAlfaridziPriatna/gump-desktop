import {useContextOrThrow} from '@lib/context';
import {culledAlbumStore} from '@lib/culledAlbum/store';
import {CulledAlbumPhoto} from '@lib/culledAlbum/types';
import {useStateStore} from '@lib/state';
import {CulledAlbumUiContext, type CulledAlbumUiState} from './culledAlbumProvider';

export function useCulledAlbumUiState<R = CulledAlbumUiState>(
  selector?: (state: CulledAlbumUiState) => R,
): R {
  return useStateStore(useContextOrThrow(CulledAlbumUiContext), selector);
}

export {useCulledAlbumActions} from './culledAlbumProvider';

export function useCulledAlbumStore<R>(
  selector: (state: ReturnType<typeof culledAlbumStore.getState>) => R,
): R {
  return useStateStore(culledAlbumStore, selector);
}

export function useCulledAlbumPhotosState(albumId: string): CulledAlbumPhoto[] {
  return useCulledAlbumStore(state => state.albums[albumId]?.photos ?? []);
}

export function useCulledAlbumUploadItems(albumId: string | null) {
  return useCulledAlbumStore(state => {
    if (!albumId) {
      return [];
    }
    return state.albums[albumId]?.photos ?? [];
  });
}

export function useCulledAlbumAnalyzeItems(albumId: string | null) {
  return useCulledAlbumStore(state => {
    if (!albumId) {
      return [];
    }
    return (state.albums[albumId]?.photos ?? []).filter(
      photo => photo.analysisStatus !== 'idle',
    );
  });
}
