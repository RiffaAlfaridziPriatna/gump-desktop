import {useContextOrThrow} from '@lib/context';
import {culledAlbumStore} from '@lib/culledAlbum/store';
import {getServerUploadBatchPhotos} from '@lib/culledAlbum/serverUploadProgress';
import {getAnalysisBatchPhotos} from '@lib/culledAlbum/analysisProgress';
import {getLocalImportBatchPhotos} from '@lib/culledAlbum/localImportProgress';
import {
  CulledAlbumPhoto,
  LocalImportBatchCounts,
} from '@lib/culledAlbum/types';
import {useStateStore} from '@lib/state';
import {useMemo} from 'react';
import {
  CulledAlbumActionsContext,
  CulledAlbumUiContext,
  type CulledAlbumUiState,
} from './culledAlbumContext';

const EMPTY_PHOTO_IDS: string[] = [];
const EMPTY_PHOTOS: CulledAlbumPhoto[] = [];

function trackMemoDependencies(..._values: unknown[]): void {}

export type CulledAlbumAnalysisCounts = {
  pending: number;
  completed: number;
  inProgress: number;
  failed: number;
  total: number;
};

function buildServerUploadStateSignature(
  albumId: string,
  state: ReturnType<typeof culledAlbumStore.getState>,
): string {
  const album = state.albums[albumId];
  if (!album?.uploadBatchPhotoIds.length) {
    return '';
  }

  return album.uploadBatchPhotoIds
    .map(photoId => {
      const photo = album.photos.find(entry => entry.photoId === photoId);
      if (!photo) {
        return `${photoId}:missing`;
      }
      return `${photoId}:${photo.serverUploadStatus}:${photo.serverUploadProgress}`;
    })
    .join('|');
}

function buildAnalysisStateSignature(
  albumId: string,
  state: ReturnType<typeof culledAlbumStore.getState>,
): string {
  const album = state.albums[albumId];
  if (!album?.analysisBatchPhotoIds.length) {
    return '';
  }

  return album.analysisBatchPhotoIds
    .map(photoId => {
      const photo = album.photos.find(entry => entry.photoId === photoId);
      if (!photo) {
        return `${photoId}:missing`;
      }
      return `${photoId}:${photo.analysisStatus}:${photo.analysisProgress}`;
    })
    .join('|');
}

function countAnalysisBatch(
  albumId: string | null,
  state: ReturnType<typeof culledAlbumStore.getState>,
): CulledAlbumAnalysisCounts | null {
  if (!albumId) {
    return null;
  }

  const album = state.albums[albumId];
  if (!album?.analysisBatchPhotoIds.length) {
    return null;
  }

  const batchIds = new Set(album.analysisBatchPhotoIds);
  const counts: CulledAlbumAnalysisCounts = {
    pending: 0,
    completed: 0,
    inProgress: 0,
    failed: 0,
    total: batchIds.size,
  };

  for (const photo of album.photos) {
    if (!batchIds.has(photo.photoId)) {
      continue;
    }
    if (photo.analysisStatus === 'pending') {
      counts.pending++;
    } else if (photo.analysisStatus === 'failed') {
      counts.failed++;
    } else if (photo.analysisStatus === 'analyzed') {
      counts.completed++;
    } else if (photo.analysisStatus === 'analyzing') {
      counts.inProgress++;
    }
  }

  return counts;
}

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
  return useCulledAlbumStore(
    state => state.albums[albumId]?.photos ?? EMPTY_PHOTOS,
  );
}

export function useCulledAlbumLocalImportProgress(
  albumId: string | null,
): LocalImportBatchCounts | null {
  return useCulledAlbumStore(state => {
    if (!albumId) {
      return null;
    }
    const album = state.albums[albumId];
    if (!album?.localImportBatchPhotoIds.length) {
      return null;
    }
    return album.localImportBatchCounts ?? null;
  });
}

/** @deprecated Prefer useCulledAlbumLocalImportProgress for upload toast progress. */
export function useCulledAlbumUploadItems(albumId: string | null) {
  const batchPhotoIds = useCulledAlbumStore(state => {
    if (!albumId) {
      return EMPTY_PHOTO_IDS;
    }
    return state.albums[albumId]?.localImportBatchPhotoIds ?? EMPTY_PHOTO_IDS;
  });
  const batchCounts = useCulledAlbumLocalImportProgress(albumId);
  const albumPhotos = useCulledAlbumStore(state => {
    if (!albumId) {
      return EMPTY_PHOTOS;
    }
    return state.albums[albumId]?.photos ?? EMPTY_PHOTOS;
  });

  return useMemo(() => {
    trackMemoDependencies(batchCounts);
    if (!albumId || batchPhotoIds.length === 0) {
      return EMPTY_PHOTOS;
    }
    return getLocalImportBatchPhotos(albumPhotos, batchPhotoIds);
  }, [albumId, albumPhotos, batchPhotoIds, batchCounts]);
}

export function useCulledAlbumServerUploadBatch(albumId: string) {
  const batchPhotoIds = useCulledAlbumStore(
    state => state.albums[albumId]?.uploadBatchPhotoIds ?? EMPTY_PHOTO_IDS,
  );
  const uploadStateSignature = useCulledAlbumStore(state =>
    buildServerUploadStateSignature(albumId, state),
  );
  const albumPhotos = useCulledAlbumStore(
    state => state.albums[albumId]?.photos ?? EMPTY_PHOTOS,
  );

  return useMemo(() => {
    trackMemoDependencies(uploadStateSignature);
    if (batchPhotoIds.length === 0) {
      return {batchPhotoIds: EMPTY_PHOTO_IDS, photos: EMPTY_PHOTOS};
    }

    return {
      batchPhotoIds,
      photos: getServerUploadBatchPhotos(albumPhotos, batchPhotoIds),
    };
  }, [albumPhotos, batchPhotoIds, uploadStateSignature]);
}

export function useCulledAlbumAnalyzeItems(albumId: string | null) {
  const batch = useCulledAlbumAnalysisBatch(albumId);
  return batch.photos;
}

export function useCulledAlbumAnalysisCounts(albumId: string | null) {
  return useCulledAlbumStore(state => countAnalysisBatch(albumId, state));
}

function useCulledAlbumAnalysisBatch(albumId: string | null) {
  const batchPhotoIds = useCulledAlbumStore(state => {
    if (!albumId) {
      return EMPTY_PHOTO_IDS;
    }
    return state.albums[albumId]?.analysisBatchPhotoIds ?? EMPTY_PHOTO_IDS;
  });
  const analysisStateSignature = useCulledAlbumStore(state => {
    if (!albumId) {
      return '';
    }
    return buildAnalysisStateSignature(albumId, state);
  });
  const albumPhotos = useCulledAlbumStore(state => {
    if (!albumId) {
      return EMPTY_PHOTOS;
    }
    return state.albums[albumId]?.photos ?? EMPTY_PHOTOS;
  });

  return useMemo(() => {
    trackMemoDependencies(analysisStateSignature);
    if (!albumId || batchPhotoIds.length === 0) {
      return {batchPhotoIds: EMPTY_PHOTO_IDS, photos: EMPTY_PHOTOS};
    }

    return {
      batchPhotoIds,
      photos: getAnalysisBatchPhotos(albumPhotos, batchPhotoIds),
    };
  }, [albumId, albumPhotos, batchPhotoIds, analysisStateSignature]);
}
