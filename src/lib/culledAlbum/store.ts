import {createCullingPhotoId} from '@lib/cullingPhotoId';
import {
  filterSupportedCullingImages,
  partitionUploadablePhotoIds,
  UNSUPPORTED_UPLOAD_FORMAT_ERROR,
} from '@lib/supportedImageFormats';
import {createStateStore} from '@lib/state';
import {FileAsset} from '@services/upload/types';
import {mergeAlbumPhotos, mergeWithMemoryAlbum} from './merge';
import {isLocalImportBatchFinished, getLocalImportBatchPhotos} from './localImportProgress';
import {readAlbum, readAllAlbums, removeAlbum, saveAlbum} from './storage';
import {syncAlbumWithDisk} from './sync';
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
  normalizePersistedAlbum,
  recomputeAlbumTotals,
  sortPhotosByUploadedAt,
} from './types';

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

  let album = persisted ?? (await readAlbum(albumId));
  if (!album) {
    throw new Error(`Album ${albumId} not found locally`);
  }
  album = {
    ...album,
    photos: mergeWithMemoryAlbum(album.photos, getAlbumFromState(albumId)?.photos),
  };
  album = await syncAlbumWithDisk(album);
  album = {
    ...album,
    photos: mergeWithMemoryAlbum(album.photos, getAlbumFromState(albumId)?.photos),
  };
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

export async function persistAlbum(albumId: string): Promise<void> {
  const album = getAlbumFromState(albumId);
  if (album) {
    await saveAlbum(JSON.parse(JSON.stringify(album)) as CulledAlbum);
  }
}

export async function clearAlbumData(albumId: string): Promise<void> {
  await removeAlbum(albumId);
  culledAlbumStore.setState(state => {
    delete state.albums[albumId];
  });
}

export async function registerLocalAlbum(album: CulledAlbum): Promise<void> {
  culledAlbumStore.setState(state => {
    state.albums[album.albumId] = album;
  });
  await saveAlbum(album);
}

export async function loadAllLocalAlbumsIntoStore(): Promise<void> {
  const persisted = await readAllAlbums();

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
        continue;
      }
      current.photos = mergeAlbumPhotos(incoming.photos, current.photos);
      recomputeAlbumTotals(current);
    }
  });
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

  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (!album) {
      throw new Error(`Album ${albumId} is not registered locally`);
    }

    const {uploadablePhotoIds, unsupportedPhotoIds} = partitionUploadablePhotoIds(
      album.photos,
      photoIds,
    );

    if (uploadablePhotoIds.length === 0) {
      throw new Error('No supported photos to upload');
    }

    album.uploadBatchPhotoIds = uploadablePhotoIds;

    const uploadableIds = new Set(uploadablePhotoIds);
    for (const photoId of photoIds) {
      const photo = album.photos.find(entry => entry.photoId === photoId);
      if (!photo) {
        continue;
      }

      if (uploadableIds.has(photoId)) {
        photo.serverUploadStatus = 'pending';
        photo.serverUploadProgress = 0;
        photo.serverUploadError = undefined;
        continue;
      }

      photo.serverUploadStatus = 'failed';
      photo.serverUploadError = UNSUPPORTED_UPLOAD_FORMAT_ERROR;
    }

    if (unsupportedPhotoIds.length > 0) {
      console.warn(
        `[startServerUploadBatch] Skipped ${unsupportedPhotoIds.length} unsupported photo(s)`,
      );
    }
  });
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
  await persistAlbum(albumId);
}

export function clearLocalImportBatch(albumId: string): void {
  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (album) {
      album.localImportBatchPhotoIds = [];
    }
  });
}

export function getAlbum(albumId: string): CulledAlbum | null {
  return getAlbumFromState(albumId);
}

export function addPhotosToAlbum(
  albumId: string,
  files: FileAsset[],
  options?: {simulatedMinDurationMs?: number},
): CulledAlbumPhoto[] {
  if (!getAlbumFromState(albumId)) {
    throw new Error(`Album ${albumId} is not registered locally`);
  }

  const supportedFiles = filterSupportedCullingImages(files);
  const added: CulledAlbumPhoto[] = [];
  if (supportedFiles.length === 0) {
    return added;
  }

  culledAlbumStore.setState(state => {
    const album = state.albums[albumId]!;

    const baseUploadedAt = Date.now();
    const addedPhotoIds: string[] = [];
    for (let index = 0; index < supportedFiles.length; index++) {
      const file = supportedFiles[index]!;
      const photo = createCulledAlbumPhoto(
        file,
        createCullingPhotoId(),
        baseUploadedAt + index,
      );
      if (options?.simulatedMinDurationMs) {
        photo.simulatedMinDurationMs = options.simulatedMinDurationMs;
      }
      album.photos.push(photo);
      added.push(photo);
      addedPhotoIds.push(photo.photoId);
    }

    album.localImportBatchPhotoIds = addedPhotoIds;
    album.photos = sortPhotosByUploadedAt(album.photos);
    recomputeAlbumTotals(album);
  });

  return added;
}

export function updatePhoto(
  albumId: string,
  photoId: string,
  updater: (photo: CulledAlbumPhoto) => void,
): boolean {
  let found = false;
  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (!album) {
      return;
    }
    const photo = album.photos.find(entry => entry.photoId === photoId);
    if (!photo) {
      return;
    }
    updater(photo);
    found = true;
    recomputeAlbumTotals(album);
  });
  return found;
}

export function getPhotosForAlbum(albumId: string): CulledAlbumPhoto[] {
  const photos = getAlbumFromState(albumId)?.photos;
  return photos ? sortPhotosByUploadedAt(photos) : [];
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
  return removed;
}

export function getPhotoById(
  albumId: string,
  photoId: string,
): CulledAlbumPhoto | undefined {
  return getPhotosForAlbum(albumId).find(photo => photo.photoId === photoId);
}

export function queuePhotosForAnalysis(albumId: string): CulledAlbumPhoto[] {
  const queued: CulledAlbumPhoto[] = [];

  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (!album) {
      return;
    }

    const batchPhotoIds: string[] = [];
    for (const photo of album.photos) {
      if (photo.status !== 'uploaded') {
        continue;
      }
      photo.analysisProgress = 0;
      photo.analysisStatus = 'pending';
      photo.analysisError = undefined;
      queued.push(photo);
      batchPhotoIds.push(photo.photoId);
    }

    album.analysisBatchPhotoIds = batchPhotoIds;
    recomputeAlbumTotals(album);
  });

  return queued;
}

export function clearAnalysisBatch(albumId: string): void {
  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (album) {
      album.analysisBatchPhotoIds = [];
    }
  });
}
