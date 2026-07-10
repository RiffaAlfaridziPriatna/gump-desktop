import {useContextOrThrow} from '@lib/react/context';
import {culledAlbumStore, getPhotoById} from '@lib/culledAlbum/store';
import {photoKey, photoStateStore} from '@lib/culledAlbum/photoStateStore';
import {getServerUploadBatchPhotos} from '@lib/culledAlbum/serverUploadProgress';
import {getAnalysisBatchPhotos} from '@lib/culledAlbum/analysisProgress';
import {
  countLocalImportBatchForAlbum,
  getLocalImportBatchPhotos,
} from '@lib/culledAlbum/localImportProgress';
import {
  CulledAlbumPhoto,
  LocalImportBatchCounts,
} from '@lib/culledAlbum/types';
import {useStateStore} from '@lib/react/state';
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

function findBatchPhoto(
  albumId: string,
  album: ReturnType<typeof culledAlbumStore.getState>['albums'][string],
  photoId: string,
): CulledAlbumPhoto | undefined {
  const fromPhotoState =
    photoStateStore.getState().photoState[photoKey(albumId, photoId)];
  if (fromPhotoState) {
    return fromPhotoState;
  }
  return album?.photos.find(entry => entry.photoId === photoId);
}

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
      const photo = findBatchPhoto(albumId, album, photoId);
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

  const counts = album.analysisBatchCounts;
  if (counts) {
    return `${counts.total}:${counts.pending}:${counts.analyzing}:${counts.analyzed}:${counts.failed}`;
  }

  return album.analysisBatchPhotoIds
    .map(photoId => {
      const photo = findBatchPhoto(albumId, album, photoId);
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

  const counts = album.analysisBatchCounts;
  if (counts) {
    return {
      pending: counts.pending,
      completed: counts.analyzed,
      inProgress: counts.analyzing,
      failed: counts.failed,
      total: counts.total,
    };
  }

  const batchIds = new Set(album.analysisBatchPhotoIds);
  const fallback: CulledAlbumAnalysisCounts = {
    pending: 0,
    completed: 0,
    inProgress: 0,
    failed: 0,
    total: batchIds.size,
  };

  for (const photoId of batchIds) {
    const photo = findBatchPhoto(albumId, album, photoId);
    if (!photo) {
      continue;
    }
    if (photo.analysisStatus === 'pending') {
      fallback.pending++;
    } else if (photo.analysisStatus === 'failed') {
      fallback.failed++;
    } else if (photo.analysisStatus === 'analyzed') {
      fallback.completed++;
    } else if (photo.analysisStatus === 'analyzing') {
      fallback.inProgress++;
    }
  }

  return fallback;
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
  const photoOrder = useStateStore(
    photoStateStore,
    state => state.photoOrder[albumId] ?? EMPTY_PHOTO_IDS,
  );
  const gridRevision = useStateStore(
    photoStateStore,
    state => state.gridRevision[albumId] ?? 0,
  );
  const photoStateEntries = useStateStore(photoStateStore, state => {
    const order = state.photoOrder[albumId] ?? EMPTY_PHOTO_IDS;
    return order.map(photoId => state.photoState[photoKey(albumId, photoId)]);
  });
  const albumPhotos = useCulledAlbumStore(
    state => state.albums[albumId]?.photos ?? EMPTY_PHOTOS,
  );

  return useMemo(() => {
    if (photoOrder.length === 0) {
      return albumPhotos;
    }

    const albumById = new Map(albumPhotos.map(photo => [photo.photoId, photo]));
    return photoOrder
      .map((photoId, index) => photoStateEntries[index] ?? albumById.get(photoId))
      .filter((photo): photo is CulledAlbumPhoto => Boolean(photo));
  }, [albumPhotos, gridRevision, photoOrder, photoStateEntries]);
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

    const counts = album.localImportBatchCounts;
    if (counts) {
      return counts;
    }

    const batchTotal =
      album.localImportBatchTotal || album.localImportBatchPhotoIds.length;
    return countLocalImportBatchForAlbum(
      album.localImportBatchPhotoIds,
      batchTotal,
      photoId => getPhotoById(albumId, photoId),
    );
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
  const albumPhotos = useStateStore(photoStateStore, state => {
    if (!albumId) {
      return EMPTY_PHOTOS;
    }
    const order = state.photoOrder[albumId] ?? [];
    const photos = order.map(photoId =>
      state.photoState[photoKey(albumId, photoId)],
    );
    return photos.filter(
      (photo): photo is CulledAlbumPhoto => Boolean(photo),
    );
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
  const albumPhotos = useStateStore(photoStateStore, state => {
    const order = state.photoOrder[albumId] ?? [];
    const photos = order.map(photoId =>
      state.photoState[photoKey(albumId, photoId)],
    );
    return photos.filter(
      (photo): photo is CulledAlbumPhoto => Boolean(photo),
    );
  });

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
  const albumPhotos = useStateStore(photoStateStore, state => {
    if (!albumId) {
      return EMPTY_PHOTOS;
    }
    const order = state.photoOrder[albumId] ?? [];
    const photos = order.map(photoId =>
      state.photoState[photoKey(albumId, photoId)],
    );
    return photos.filter(
      (photo): photo is CulledAlbumPhoto => Boolean(photo),
    );
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
