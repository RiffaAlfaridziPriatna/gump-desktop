import {current, isDraft} from 'immer';
import {container} from '@di/container';
import {TOKENS} from '@di/tokens';
import {IPhotoRepository} from '@/domain/repositories/IPhotoRepository';
import {photoIdFromStoredFile} from '@lib/culling/cullingPhotoId';
import {
  filterSupportedCullingImages,
  partitionUploadablePhotoIds,
  UNSUPPORTED_UPLOAD_FORMAT_ERROR,
} from '@lib/media/supportedImageFormats';
import {createStateStore} from '@lib/react/state';
import {FileAsset} from '@services/upload/types';
import {mergeAlbumPhotos, mergeWithMemoryAlbum} from './merge';
import {
  createLocalImportBatchCounts,
  computeLocalImportBatchCounts,
  isLocalImportBatchFinished,
  getLocalImportBatchPhotos,
} from './localImportProgress';
import {readAlbumMeta, readAllAlbumMeta, removeAlbum, saveAlbum, type SaveAlbumOptions} from './storage';
import {toPersistableAlbum} from './toPersistableAlbum';
import {syncAlbumWithDisk} from './sync';
import {
  ensurePhotoOrder,
  hydrateAllPhotos,
  hydratePhotos,
  setPhotoOrder,
} from './photoLoader';
import {setQueueOperationStatus} from './uploadQueueStore';
import {
  isServerUploadBatchFinished,
  isServerUploadBatchSuccessful,
} from './serverUploadProgress';
import {
  createCulledAlbumPhoto,
  CulledAlbum,
  CulledAlbumPhoto,
  hasInFlightAnalysis,
  hasInFlightServerUploads,
  hasInFlightUploads,
  LocalImportCountKey,
  normalizePersistedAlbum,
  recomputeAlbumTotals,
  sortPhotosByFilename,
} from './types';
import {scheduleThumbnailBackfill} from './thumbnailBackfill';
import {photoKey, photoStateStore} from './photoStateStore';
import {clearFaceClusterIndex} from '@lib/culling/faceClusterIndex';
import {
  runOrDeferHeavyWorkForNavigation,
  shouldDeferHeavyWorkForNavigation,
} from '@lib/navigation/uploadAwareNavigation';

export type CulledAlbumStoreState = {
  albums: Record<string, CulledAlbum>;
  error: string | null;
};

export const culledAlbumStore = createStateStore<CulledAlbumStoreState>({
  albums: {},
  error: null,
});

function getAlbumFromState(albumId: string): CulledAlbum | null {
  return culledAlbumStore.getState().albums[albumId] ?? null;
}

function toPlainPhoto(photo: CulledAlbumPhoto): CulledAlbumPhoto {
  return isDraft(photo) ? current(photo) : photo;
}

export function syncPhotoStateForAlbum(
  albumId: string,
  photos: CulledAlbumPhoto[],
): void {
  if (photos.length === 0) {
    return;
  }

  photoStateStore.setState(state => {
    const nextPhotoIds = photos.map(p => p.photoId);
    const nextIdSet = new Set(nextPhotoIds);

    const prevPhotoIds = state.photoOrder[albumId] ?? [];
    for (const prevPhotoId of prevPhotoIds) {
      if (!nextIdSet.has(prevPhotoId)) {
        delete state.photoState[photoKey(albumId, prevPhotoId)];
      }
    }

    state.photoOrder[albumId] = nextPhotoIds;
    for (const photo of photos) {
      const plainPhoto = toPlainPhoto(photo);
      state.photoState[photoKey(albumId, plainPhoto.photoId)] = plainPhoto;
    }
  });
}

function applyAlbumMergeInState(albumId: string, incoming: CulledAlbum): void {
  culledAlbumStore.setState(state => {
    const current = state.albums[albumId];
    if (!current) {
      state.albums[albumId] = incoming;
      recomputeAlbumTotals(state.albums[albumId]!);
      return;
    }

    current.photos = mergeAlbumPhotos(current.photos, incoming.photos);
    recomputeAlbumTotals(current);
  });

  const album = getAlbumFromState(albumId);
  if (album) {
    syncPhotoStateForAlbum(albumId, album.photos);
  }
}

async function buildRefreshedAlbum(
  albumId: string,
  persisted?: CulledAlbum | null,
): Promise<CulledAlbum> {
  const active = getAlbumFromState(albumId);
  if (
    hasInFlightUploads(active) ||
    hasInFlightAnalysis(active) ||
    hasInFlightServerUploads(active)
  ) {
    return active!;
  }

  const albumMeta = persisted ?? (await readAlbumMeta(albumId));
  if (!albumMeta) {
    throw new Error(`Album ${albumId} not found locally`);
  }

  let album = normalizePersistedAlbum(albumMeta);

  const inMemoryPhotos = mergeWithMemoryAlbum(
    [],
    getAlbumFromState(albumId)?.photos,
  );
  album = {...album, photos: inMemoryPhotos};

  const knownPhotoIds = ensurePhotoOrder(albumId);
  const synced = await syncAlbumWithDisk(album, knownPhotoIds);
  album = {
    ...synced.album,
    photos: mergeWithMemoryAlbum(
      synced.album.photos,
      getAlbumFromState(albumId)?.photos,
    ),
  };
  album.totalPhotos = synced.photoOrder.length;
  setPhotoOrder(albumId, synced.photoOrder);
  return album;
}

export async function loadAlbumIntoStore(albumId: string): Promise<CulledAlbum> {
  const active = getAlbumFromState(albumId);
  if (
    hasInFlightUploads(active) ||
    hasInFlightAnalysis(active) ||
    hasInFlightServerUploads(active)
  ) {
    return active!;
  }

  const album = await buildRefreshedAlbum(albumId);
  applyAlbumMergeInState(albumId, album);
  return getAlbumFromState(albumId) ?? album;
}

export type PersistAlbumOptions = SaveAlbumOptions;

async function persistAlbumNow(
  albumId: string,
  options: PersistAlbumOptions = {},
): Promise<void> {
  if (!hasAnyInFlightAlbumWork()) {
    syncAlbumTotalsFromRepository(albumId);
  }

  const album = getAlbumFromState(albumId);
  if (album) {
    await saveAlbum(toPersistableAlbum(album), {
      includePhotos: options.includePhotos ?? false,
    });
  }
}

export async function persistAlbum(
  albumId: string,
  options: PersistAlbumOptions = {},
): Promise<void> {
  if (shouldDeferHeavyWorkForNavigation()) {
    return new Promise<void>((resolve, reject) => {
      runOrDeferHeavyWorkForNavigation(() => {
        persistAlbumNow(albumId, options).then(resolve).catch(reject);
      });
    });
  }

  return persistAlbumNow(albumId, options);
}

export function syncAlbumTotalsFromRepository(albumId: string): void {
  const photoRepo = container.resolve<IPhotoRepository>(TOKENS.IPhotoRepository);
  const totalPhotos = photoRepo.countByAlbum(albumId);
  const totalStorage = photoRepo.sumFileSizeByAlbum(albumId);

  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (!album) {
      return;
    }
    album.totalPhotos = totalPhotos;
    album.totalStorage = totalStorage;
  });
}

export type UpdatePhotoOptions = {
  recomputeTotals?: boolean;
  storageDelta?: number;
  batchCountShift?: {
    from: LocalImportCountKey;
    to: LocalImportCountKey;
  };
};

export function shiftLocalImportBatchCount(
  albumId: string,
  from: LocalImportCountKey,
  to: LocalImportCountKey,
): void {
  culledAlbumStore.setState(state => {
    const counts = state.albums[albumId]?.localImportBatchCounts;
    if (!counts) {
      return;
    }
    if (counts[from] > 0) {
      counts[from]--;
    }
    counts[to]++;
  });
}

export function reconcileLocalImportBatchCounts(albumId: string): void {
  const album = getAlbumFromState(albumId);
  if (!album || album.localImportBatchPhotoIds.length === 0) {
    return;
  }

  culledAlbumStore.setState(state => {
    const entry = state.albums[albumId];
    if (!entry) {
      return;
    }
    entry.localImportBatchCounts = computeLocalImportBatchCounts(
      entry.photos,
      entry.localImportBatchPhotoIds,
    );
  });
}

export async function clearAlbumData(albumId: string): Promise<void> {
  clearFaceClusterIndex(albumId);
  await removeAlbum(albumId);
  culledAlbumStore.setState(state => {
    delete state.albums[albumId];
  });
  photoStateStore.setState(state => {
    for (const photoId of state.photoOrder[albumId] ?? []) {
      delete state.photoState[photoKey(albumId, photoId)];
    }
    delete state.photoOrder[albumId];
  });
}

export async function registerLocalAlbum(album: CulledAlbum): Promise<void> {
  culledAlbumStore.setState(state => {
    state.albums[album.albumId] = album;
  });
  syncPhotoStateForAlbum(album.albumId, album.photos);
  await saveAlbum(toPersistableAlbum(album), {includePhotos: true});
}

export function hasAnyInFlightAlbumWork(): boolean {
  return Object.keys(culledAlbumStore.getState().albums).some(albumId => {
    const album = getAlbumFromState(albumId);
    if (!album) {
      return false;
    }
    const photos = getPhotosForAlbum(albumId);
    return (
      hasInFlightUploads(album, photos) ||
      hasInFlightAnalysis(album, photos) ||
      hasInFlightServerUploads(album, photos)
    );
  });
}

export async function loadAllLocalAlbumsIntoStore(): Promise<void> {
  const persisted = await readAllAlbumMeta();
  const albumIds = Object.keys(persisted);

  culledAlbumStore.setState(state => {
    state.error = null;
    for (const [albumId, raw] of Object.entries(persisted)) {
      const incoming = normalizePersistedAlbum({...raw});
      const current = state.albums[albumId];
      if (
        current &&
        (hasInFlightUploads(current) ||
          hasInFlightAnalysis(current) ||
          hasInFlightServerUploads(current))
      ) {
        current.photos = mergeAlbumPhotos(incoming.photos, current.photos);
        recomputeAlbumTotals(current);
        continue;
      }
      if (!current) {
        state.albums[albumId] = incoming;
        if (hasInFlightUploads(incoming)) {
          incoming.localImportBatchCounts = computeLocalImportBatchCounts(
            incoming.photos,
            incoming.localImportBatchPhotoIds,
          );
        }
        continue;
      }
      current.photos = mergeAlbumPhotos(incoming.photos, current.photos);
      recomputeAlbumTotals(current);
    }
  });

  for (const albumId of albumIds) {
    ensurePhotoOrder(albumId);
    syncAlbumTotalsFromRepository(albumId);

    const album = getAlbumFromState(albumId);
    if (!album) {
      continue;
    }
    if (album.photos.length > 0) {
      syncPhotoStateForAlbum(albumId, album.photos);
    }
  }
}

export async function markCullingCompleted(albumId: string): Promise<void> {
  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (album) {
      album.cullingCompleted = true;
    }
  });
  await persistAlbum(albumId);
}

export async function markCullingHasUploads(albumId: string): Promise<void> {
  const album = getAlbumFromState(albumId);
  if (!album || album.cullingHasUploads) {
    return;
  }
  culledAlbumStore.setState(state => {
    const entry = state.albums[albumId];
    if (entry) {
      entry.cullingHasUploads = true;
    }
  });
  await persistAlbum(albumId);
}

export function startServerUploadBatch(
  albumId: string,
  photoIds: string[],
): void {
  if (photoIds.length === 0) {
    throw new Error('No photos selected for upload');
  }

  hydratePhotos(albumId, photoIds);
  const albumPhotos = getPhotosForAlbum(albumId);
  const {uploadablePhotoIds, unsupportedPhotoIds} = partitionUploadablePhotoIds(
    albumPhotos,
    photoIds,
  );

  if (uploadablePhotoIds.length === 0) {
    throw new Error('No supported photos to upload');
  }

  const uploadableIds = new Set(uploadablePhotoIds);
  for (const photoId of photoIds) {
    const supported = uploadableIds.has(photoId);
    updatePhoto(
      albumId,
      photoId,
      photo => {
        if (supported) {
          photo.serverUploadStatus = 'pending';
          photo.serverUploadProgress = 0;
          photo.serverUploadError = undefined;
          return;
        }
        photo.serverUploadStatus = 'failed';
        photo.serverUploadError = UNSUPPORTED_UPLOAD_FORMAT_ERROR;
      },
      {recomputeTotals: false},
    );
  }

  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (!album) {
      throw new Error(`Album ${albumId} is not registered locally`);
    }
    album.uploadBatchPhotoIds = uploadablePhotoIds;
  });

  if (unsupportedPhotoIds.length > 0) {
    console.warn(
      `[startServerUploadBatch] Skipped ${unsupportedPhotoIds.length} unsupported photo(s)`,
    );
  }

  syncPhotoStateForAlbum(albumId, getPhotosForAlbum(albumId));
}

export async function checkServerUploadBatchComplete(
  albumId: string,
): Promise<void> {
  const album = getAlbumFromState(albumId);
  if (
    !album ||
    !isServerUploadBatchFinished(album.photos, album.uploadBatchPhotoIds)
  ) {
    return;
  }

  if (isServerUploadBatchSuccessful(album.photos, album.uploadBatchPhotoIds)) {
    await markCullingHasUploads(albumId);
    setQueueOperationStatus(albumId, 'serverUpload', 'completed');
  } else {
    setQueueOperationStatus(albumId, 'serverUpload', 'failed');
  }
  await persistAlbum(albumId);
}

export async function checkLocalImportBatchComplete(
  albumId: string,
): Promise<void> {
  const album = getAlbumFromState(albumId);
  if (
    !album ||
    album.localImportBatchPhotoIds.length === 0 ||
    !isLocalImportBatchFinished(album.photos, album.localImportBatchPhotoIds)
  ) {
    return;
  }

  const batchPhotos = getLocalImportBatchPhotos(
    album.photos,
    album.localImportBatchPhotoIds,
  );
  const hasUploaded = batchPhotos.some(photo => photo.status === 'uploaded');
  setQueueOperationStatus(
    albumId,
    'localImport',
    hasUploaded ? 'completed' : 'failed',
  );
  if (hasUploaded) {
    scheduleThumbnailBackfill(albumId);
  }
  await persistAlbum(albumId);
}

export function clearLocalImportBatch(albumId: string): void {
  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (album) {
      album.localImportBatchPhotoIds = [];
      album.localImportBatchCounts = undefined;
    }
  });
}

export function getAlbum(albumId: string): CulledAlbum | null {
  return getAlbumFromState(albumId);
}

export function addPhotosToAlbum(
  albumId: string,
  files: FileAsset[],
): CulledAlbumPhoto[] {
  if (!getAlbumFromState(albumId)) {
    throw new Error(`Album ${albumId} is not registered locally`);
  }

  const supportedFiles = filterSupportedCullingImages(files);
  const addedPhotoIds: string[] = [];
  if (supportedFiles.length === 0) {
    return [];
  }

  culledAlbumStore.setState(state => {
    const album = state.albums[albumId]!;

    const baseUploadedAt = Date.now();
    for (let index = 0; index < supportedFiles.length; index++) {
      const file = supportedFiles[index]!;
      const photo = createCulledAlbumPhoto(
        file,
        photoIdFromStoredFile(file),
        baseUploadedAt + index,
      );
      album.photos.push(photo);
      addedPhotoIds.push(photo.photoId);
    }

    album.localImportBatchPhotoIds = addedPhotoIds;
    album.localImportBatchCounts = createLocalImportBatchCounts(addedPhotoIds.length);
    album.photos = sortPhotosByFilename(album.photos);
    recomputeAlbumTotals(album);
  });

  const album = getAlbumFromState(albumId);
  if (album) {
    syncPhotoStateForAlbum(albumId, album.photos);
  }

  return addedPhotoIds
    .map(photoId => album?.photos.find(photo => photo.photoId === photoId))
    .filter((photo): photo is CulledAlbumPhoto => Boolean(photo));
}

export function updatePhoto(
  albumId: string,
  photoId: string,
  updater: (photo: CulledAlbumPhoto) => void,
  options?: UpdatePhotoOptions,
): boolean {
  const recomputeTotals = options?.recomputeTotals ?? true;
  const storageDelta = options?.storageDelta ?? 0;
  const batchCountShift = options?.batchCountShift;
  const key = photoKey(albumId, photoId);
  let found = false;

  photoStateStore.setState(state => {
    const photo = state.photoState[key];
    if (!photo) {
      return;
    }
    updater(photo);
    found = true;
  });

  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (!album) {
      return;
    }
    const photo = album.photos.find(entry => entry.photoId === photoId);
    if (photo) {
      updater(photo);
      found = true;
    }
  });

  if (!found) {
    return false;
  }

  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (!album) {
      return;
    }
    if (batchCountShift) {
      const counts = album.localImportBatchCounts;
      if (counts && counts[batchCountShift.from] > 0) {
        counts[batchCountShift.from]--;
        counts[batchCountShift.to]++;
      }
    }
    if (recomputeTotals) {
      recomputeAlbumTotals(album);
    } else if (storageDelta !== 0) {
      album.totalStorage = Math.max(0, album.totalStorage + storageDelta);
    }
  });

  return true;
}

export function getPhotosForAlbum(albumId: string): CulledAlbumPhoto[] {
  const order = photoStateStore.getState().photoOrder[albumId];
  if (order && order.length > 0) {
    const hydrated = order
      .map(photoId => photoStateStore.getState().photoState[photoKey(albumId, photoId)])
      .filter((photo): photo is CulledAlbumPhoto => Boolean(photo));
    const hydratedIds = new Set(hydrated.map(photo => photo.photoId));
    const album = getAlbumFromState(albumId);
    if (album) {
      for (const photo of album.photos) {
        if (!hydratedIds.has(photo.photoId)) {
          hydrated.push(photo);
        }
      }
    }
    return hydrated;
  }
  return getAlbumFromState(albumId)?.photos ?? [];
}

export async function ensureAlbumLoaded(albumId: string): Promise<CulledAlbum> {
  const existing = getAlbumFromState(albumId);
  if (existing) {
    return existing;
  }
  return loadAlbumIntoStore(albumId);
}

export function removePhotoFromAlbum(
  albumId: string,
  photoId: string,
): boolean {
  let removed = false;
  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (!album) {
      return;
    }
    const nextLength = album.photos.length;
    album.photos = album.photos.filter(photo => photo.photoId !== photoId);
    removed = album.photos.length < nextLength;
    if (removed) {
      recomputeAlbumTotals(album);
    }
  });

  if (removed) {
    const album = getAlbumFromState(albumId);
    if (album) {
      syncPhotoStateForAlbum(albumId, album.photos);
    } else {
      photoStateStore.setState(state => {
        delete state.photoState[photoKey(albumId, photoId)];
      });
    }
  }
  return removed;
}

export function getPhotoById(
  albumId: string,
  photoId: string,
): CulledAlbumPhoto | undefined {
  const fromState = photoStateStore.getState().photoState[photoKey(albumId, photoId)];
  if (fromState) {
    return fromState;
  }

  const fromAlbum = getAlbumFromState(albumId)?.photos.find(
    photo => photo.photoId === photoId,
  );
  if (fromAlbum) {
    return fromAlbum;
  }

  hydratePhotos(albumId, [photoId]);
  return photoStateStore.getState().photoState[photoKey(albumId, photoId)];
}

export function queuePhotosForAnalysis(albumId: string): CulledAlbumPhoto[] {
  hydrateAllPhotos(albumId);
  const uploadedPhotos = getPhotosForAlbum(albumId).filter(
    photo => photo.status === 'uploaded',
  );
  const queuedPhotoIds: string[] = [];

  for (const photo of uploadedPhotos) {
    updatePhoto(
      albumId,
      photo.photoId,
      entry => {
        entry.analysisProgress = 0;
        entry.analysisStatus = 'pending';
        entry.analysisError = undefined;
      },
      {recomputeTotals: false},
    );
    queuedPhotoIds.push(photo.photoId);
  }

  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (!album) {
      return;
    }
    album.analysisBatchPhotoIds = queuedPhotoIds;
    recomputeAlbumTotals(album);
  });

  syncPhotoStateForAlbum(albumId, getPhotosForAlbum(albumId));

  return queuedPhotoIds
    .map(photoId => getPhotoById(albumId, photoId))
    .filter((photo): photo is CulledAlbumPhoto => Boolean(photo));
}

export function clearAnalysisBatch(albumId: string): void {
  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (album) {
      album.analysisBatchPhotoIds = [];
    }
  });
}
