import {current, isDraft} from 'immer';
import {container} from '@di/container';
import {TOKENS} from '@di/tokens';
import {IPhotoRepository} from '@/domain/repositories/IPhotoRepository';
import {syncPhotosFromStoreAwait} from '@/application/syncPhotoRepository';
import {createCullingPhotoId} from '@lib/culling/cullingPhotoId';
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
  countLocalImportBatchForAlbum,
  computeLocalImportBatchCountsForIds,
  isLocalImportBatchFinishedForIds,
} from './localImportProgress';
import {
  createAnalysisBatchCounts,
  computeAnalysisBatchCountsForIds,
  isAnalysisBatchFinishedByCounts,
} from './analysisProgress';
import {readAlbumMeta, readAllAlbumMeta, removeAlbum, saveAlbum, type SaveAlbumOptions} from './storage';
import {toPersistableAlbum} from './toPersistableAlbum';
import {syncAlbumWithDisk} from './sync';
import {
  ensurePhotoOrder,
  getPhotoIdsForAlbum,
  hydratePhotos,
  setPhotoOrder,
} from './photoLoader';
import {finishLocalImportQueue, getAlbumQueueState, hasActiveQueueWork, setQueueOperationStatus} from './uploadQueueStore';
import {
  getServerUploadBatchPhotos,
  isServerUploadBatchFinished,
} from './serverUploadProgress';
import {
  createCulledAlbumPhoto,
  CulledAlbum,
  CulledAlbumPhoto,
  AnalysisCountKey,
  hasInFlightAnalysis,
  hasInFlightServerUploads,
  hasInFlightUploads,
  LocalImportCountKey,
  normalizePersistedAlbum,
  recomputeAlbumTotals,
  sortPhotosByFilename,
  toCullingPhoto,
} from './types';
import {computeKeyFaces, computeStats, orderCulledAlbumPhotosForCulling} from '@lib/culling/cullingUtil';
import {APIResponse} from '@services/api';
import {scheduleThumbnailBackfill} from './thumbnailBackfill';
import {photoKey, photoStateStore} from './photoStateStore';
import {
  flushPendingPhotoUpdates as flushBatchedPhotoUpdates,
  registerPhotoUpdateBatchApplier,
  schedulePhotoUpdate,
  type PendingPhotoUpdate,
} from './photoUpdateBatcher';
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

function syncAddedPhotosToState(
  albumId: string,
  addedPhotos: CulledAlbumPhoto[],
): void {
  if (addedPhotos.length === 0) {
    return;
  }

  photoStateStore.setState(state => {
    const order = state.photoOrder[albumId] ?? [];
    const knownIds = new Set(order);

    for (const photo of addedPhotos) {
      const plainPhoto = toPlainPhoto(photo);
      state.photoState[photoKey(albumId, plainPhoto.photoId)] = plainPhoto;
      if (!knownIds.has(plainPhoto.photoId)) {
        order.push(plainPhoto.photoId);
        knownIds.add(plainPhoto.photoId);
      }
    }

    state.photoOrder[albumId] = order;
  });
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
      if (incoming.photos.length > 0) {
        recomputeAlbumTotals(state.albums[albumId]!);
      }
      return;
    }

    current.photos = mergeAlbumPhotos(current.photos, incoming.photos);
    if (current.photos.length > 0) {
      recomputeAlbumTotals(current);
    } else {
      current.totalPhotos = Math.max(current.totalPhotos, incoming.totalPhotos);
      current.totalStorage = Math.max(current.totalStorage, incoming.totalStorage);
    }
  });

  const album = getAlbumFromState(albumId);
  if (album) {
    syncPhotoStateForAlbum(albumId, album.photos);
  }

  syncAlbumTotalsFromRepository(albumId);
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
  if (!hasActiveQueueWork()) {
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
  const repoPhotoCount = photoRepo.countByAlbum(albumId);
  const repoStorage = photoRepo.sumFileSizeByAlbum(albumId);

  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (!album) {
      return;
    }

    const memoryPhotoCount = Math.max(
      album.photos.length,
      album.localImportBatchTotal || 0,
    );
    album.totalPhotos = Math.max(repoPhotoCount, memoryPhotoCount);
    album.totalStorage = Math.max(repoStorage, album.totalStorage);
  });
}

export type UpdatePhotoOptions = {
  recomputeTotals?: boolean;
  storageDelta?: number;
  batchCountShift?: {
    from: LocalImportCountKey;
    to: LocalImportCountKey;
  };
  analysisCountShift?: {
    from: AnalysisCountKey;
    to: AnalysisCountKey;
  };
  immediate?: boolean;
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

  const counts = computeLocalImportBatchCountsForIds(
    album.localImportBatchPhotoIds,
    photoId => lookupPhotoForImportCount(albumId, photoId),
  );
  counts.total = album.localImportBatchTotal || counts.total;

  culledAlbumStore.setState(state => {
    const entry = state.albums[albumId];
    if (entry) {
      entry.localImportBatchCounts = counts;
    }
  });
}

const UPLOAD_STATUS_RANK: Record<CulledAlbumPhoto['status'], number> = {
  pending: 0,
  uploading: 1,
  uploaded: 2,
  failed: 2,
};

function pickMoreProgressedPhoto(
  fromState?: CulledAlbumPhoto,
  fromAlbum?: CulledAlbumPhoto,
): CulledAlbumPhoto | undefined {
  if (!fromState) {
    return fromAlbum;
  }
  if (!fromAlbum) {
    return fromState;
  }

  const stateRank = UPLOAD_STATUS_RANK[fromState.status] ?? 0;
  const albumRank = UPLOAD_STATUS_RANK[fromAlbum.status] ?? 0;
  return albumRank > stateRank ? fromAlbum : fromState;
}

function lookupPhotoForImportCount(
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
  return fromAlbum;
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
  for (const albumId of Object.keys(culledAlbumStore.getState().albums)) {
    const album = getAlbumFromState(albumId);
    if (!album) {
      continue;
    }

    if (hasInFlightUploads(album)) {
      return true;
    }

    if (
      album.analysisBatchPhotoIds.length === 0 &&
      album.uploadBatchPhotoIds.length === 0
    ) {
      continue;
    }

    const photos = getPhotosForAlbum(albumId);
    if (
      hasInFlightAnalysis(album, photos) ||
      hasInFlightServerUploads(album, photos)
    ) {
      return true;
    }
  }

  return false;
}

export async function loadAllLocalAlbumsIntoStore(): Promise<void> {
  const persisted = await readAllAlbumMeta();
  const albumIds = Object.keys(persisted);
  const photoRepo = container.resolve<IPhotoRepository>(TOKENS.IPhotoRepository);
  const totalsByAlbum = new Map<string, {totalPhotos: number; totalStorage: number}>();

  for (const albumId of albumIds) {
    ensurePhotoOrder(albumId);
    totalsByAlbum.set(albumId, {
      totalPhotos: photoRepo.countByAlbum(albumId),
      totalStorage: photoRepo.sumFileSizeByAlbum(albumId),
    });
  }

  culledAlbumStore.setState(state => {
    state.error = null;
    for (const [albumId, raw] of Object.entries(persisted)) {
      const incoming = normalizePersistedAlbum({...raw});
      const totals = totalsByAlbum.get(albumId);
      if (totals) {
        incoming.totalPhotos = totals.totalPhotos;
        incoming.totalStorage = totals.totalStorage;
      }
      const current = state.albums[albumId];
      if (
        current &&
        (hasInFlightUploads(current) ||
          hasInFlightAnalysis(current) ||
          hasInFlightServerUploads(current))
      ) {
        current.photos = mergeAlbumPhotos(incoming.photos, current.photos);
        if (current.photos.length > 0) {
          recomputeAlbumTotals(current);
        } else if (totals) {
          current.totalPhotos = Math.max(current.totalPhotos, totals.totalPhotos);
          current.totalStorage = Math.max(current.totalStorage, totals.totalStorage);
        }
        continue;
      }
      if (!current) {
        state.albums[albumId] = incoming;
        if (hasInFlightUploads(incoming)) {
          incoming.localImportBatchCounts = computeLocalImportBatchCountsForIds(
            incoming.localImportBatchPhotoIds,
            photoId => lookupPhotoForImportCount(albumId, photoId),
          );
        }
        continue;
      }
      current.photos = mergeAlbumPhotos(incoming.photos, current.photos);
      if (current.photos.length > 0) {
        recomputeAlbumTotals(current);
      } else if (totals) {
        current.totalPhotos = Math.max(current.totalPhotos, totals.totalPhotos);
        current.totalStorage = Math.max(current.totalStorage, totals.totalStorage);
      }
    }
  });

  for (const albumId of albumIds) {
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

export function updateCullingSummary(albumId: string): void {
  const analyzed = orderCulledAlbumPhotosForCulling(
    albumId,
    getPhotosForAlbum(albumId).filter(
      photo => photo.analysisStatus === 'analyzed',
    ),
  ).map(toCullingPhoto);
  const stats = analyzed.length > 0 ? computeStats(analyzed) : undefined;
  const keyFaces = analyzed.length > 0 ? computeKeyFaces(analyzed) : undefined;

  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (!album) {
      return;
    }
    album.cullingStats = stats;
    album.cullingKeyFaces = keyFaces;
  });
}

export function getCullingSummary(albumId: string): {
  stats: APIResponse.CullingStats | null;
  keyFaces: APIResponse.CullingKeyFace[];
} {
  const album = getAlbumFromState(albumId);
  return {
    stats: album?.cullingStats ?? null,
    keyFaces: album?.cullingKeyFaces ?? [],
  };
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

  flushPendingPhotoUpdates();
}

export async function checkServerUploadBatchComplete(
  albumId: string,
): Promise<void> {
  flushPendingPhotoUpdates();

  const album = getAlbumFromState(albumId);
  if (!album || album.uploadBatchPhotoIds.length === 0) {
    return;
  }

  const photos = getPhotosForAlbum(albumId);
  if (!isServerUploadBatchFinished(photos, album.uploadBatchPhotoIds)) {
    return;
  }

  const batchPhotos = getServerUploadBatchPhotos(photos, album.uploadBatchPhotoIds);
  if (batchPhotos.some(photo => photo.serverUploadStatus === 'uploaded')) {
    await markCullingHasUploads(albumId);
  }
  setQueueOperationStatus(albumId, 'serverUpload', 'completed');
  await persistAlbum(albumId);
}

const BATCH_COMPLETE_DEBOUNCE_MS = 120;
const pendingBatchCompleteChecks = new Set<string>();
let batchCompleteCheckTimer: ReturnType<typeof setTimeout> | null = null;

export function scheduleLocalImportBatchCompleteCheck(albumId: string): void {
  pendingBatchCompleteChecks.add(albumId);
  if (batchCompleteCheckTimer) {
    return;
  }

  batchCompleteCheckTimer = setTimeout(() => {
    batchCompleteCheckTimer = null;
    const albumIds = [...pendingBatchCompleteChecks];
    pendingBatchCompleteChecks.clear();
    for (const id of albumIds) {
      void checkLocalImportBatchComplete(id);
    }
  }, BATCH_COMPLETE_DEBOUNCE_MS);
}

export async function checkLocalImportBatchComplete(
  albumId: string,
): Promise<void> {
  const existingQueueStatus = getAlbumQueueState(albumId).localImport.status;
  if (existingQueueStatus === 'completed' || existingQueueStatus === 'failed') {
    return;
  }

  if (shouldDeferHeavyWorkForNavigation()) {
    scheduleLocalImportBatchCompleteCheck(albumId);
    return;
  }

  flushPendingPhotoUpdates();

  const album = getAlbumFromState(albumId);
  if (!album || album.localImportBatchPhotoIds.length === 0) {
    return;
  }

  const batchPhotoIds = album.localImportBatchPhotoIds;
  const counts = album.localImportBatchCounts;
  if (counts) {
    if (counts.pending > 0 || counts.uploading > 0) {
      return;
    }
  } else if (
    !isLocalImportBatchFinishedForIds(batchPhotoIds, photoId =>
      lookupPhotoForImportCount(albumId, photoId),
    )
  ) {
    return;
  }

  reconcileLocalImportBatchCounts(albumId);
  const batchTotal = album.localImportBatchTotal || batchPhotoIds.length;
  const finalCounts = countLocalImportBatchForAlbum(
    batchPhotoIds,
    batchTotal,
    photoId => lookupPhotoForImportCount(albumId, photoId),
  );

  if (finalCounts.pending > 0 || finalCounts.uploading > 0) {
    return;
  }

  const hasUploaded = finalCounts.uploaded > 0;
  finishLocalImportQueue(albumId, {
    status: hasUploaded ? 'completed' : 'failed',
    uploadedCount: finalCounts.uploaded,
    failedCount: finalCounts.failed,
  });
  if (hasUploaded) {
    scheduleThumbnailBackfill(albumId);
  }

  await syncPhotosFromStoreAwait(albumId, [...batchPhotoIds]);
  await persistAlbum(albumId);
}

export function clearLocalImportBatch(albumId: string): void {
  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (album) {
      album.localImportBatchPhotoIds = [];
      album.localImportBatchTotal = 0;
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
  const addedPhotos: CulledAlbumPhoto[] = [];
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
        createCullingPhotoId(),
        baseUploadedAt + index,
      );
      album.photos.push(photo);
      addedPhotos.push(photo);
      addedPhotoIds.push(photo.photoId);
    }

    album.localImportBatchPhotoIds = addedPhotoIds;
    album.localImportBatchTotal = addedPhotoIds.length;
    album.localImportBatchCounts = createLocalImportBatchCounts(addedPhotoIds.length);
    album.photos = sortPhotosByFilename(album.photos);
    recomputeAlbumTotals(album);
  });

  syncAddedPhotosToState(albumId, addedPhotos);

  return addedPhotos;
}

function applyPhotoUpdatesBatch(updates: PendingPhotoUpdate[]): boolean {
  if (updates.length === 0) {
    return false;
  }

  const foundKeys = new Set<string>();

  photoStateStore.setState(state => {
    for (const update of updates) {
      const key = photoKey(update.albumId, update.photoId);
      const photo = state.photoState[key];
      if (!photo) {
        continue;
      }
      update.updater(photo);
      foundKeys.add(key);
    }
  });

  culledAlbumStore.setState(state => {
    const albumPhotoMaps = new Map<string, Map<string, CulledAlbumPhoto>>();

    for (const update of updates) {
      const album = state.albums[update.albumId];
      if (!album) {
        continue;
      }

      let photoMap = albumPhotoMaps.get(update.albumId);
      if (!photoMap) {
        photoMap = new Map<string, CulledAlbumPhoto>();
        for (const entry of album.photos) {
          photoMap.set(entry.photoId, entry);
        }
        albumPhotoMaps.set(update.albumId, photoMap);
      }

      const photo = photoMap.get(update.photoId);
      if (!photo) {
        continue;
      }
      update.updater(photo);
      foundKeys.add(photoKey(update.albumId, update.photoId));
    }

    const albumMeta = new Map<
      string,
      {
        storageDelta: number;
        recomputeTotals: boolean;
      }
    >();

    for (const update of updates) {
      const key = photoKey(update.albumId, update.photoId);
      if (!foundKeys.has(key)) {
        continue;
      }

      let meta = albumMeta.get(update.albumId);
      if (!meta) {
        meta = {storageDelta: 0, recomputeTotals: false};
        albumMeta.set(update.albumId, meta);
      }

      const opts = update.options;
      if (opts?.recomputeTotals) {
        meta.recomputeTotals = true;
      }
      meta.storageDelta += opts?.storageDelta ?? 0;
    }

    for (const update of updates) {
      const shift = update.options?.batchCountShift;
      if (!shift) {
        continue;
      }
      const album = state.albums[update.albumId];
      const counts = album?.localImportBatchCounts;
      if (!counts) {
        continue;
      }
      if (counts[shift.from] > 0) {
        counts[shift.from]--;
      }
      counts[shift.to]++;
    }

    for (const update of updates) {
      const shift = update.options?.analysisCountShift;
      if (!shift) {
        continue;
      }
      const album = state.albums[update.albumId];
      const counts = album?.analysisBatchCounts;
      if (!counts) {
        continue;
      }
      if (counts[shift.from] > 0) {
        counts[shift.from]--;
      }
      counts[shift.to]++;
    }

    for (const [albumId, meta] of albumMeta) {
      const album = state.albums[albumId];
      if (!album) {
        continue;
      }

      if (meta.recomputeTotals) {
        recomputeAlbumTotals(album);
      } else if (meta.storageDelta !== 0) {
        album.totalStorage = Math.max(0, album.totalStorage + meta.storageDelta);
      }
    }
  });

  const albumsToReconcile = new Set<string>();
  for (const update of updates) {
    const album = getAlbumFromState(update.albumId);
    if (album?.localImportBatchPhotoIds.length) {
      albumsToReconcile.add(update.albumId);
    }
  }
  for (const albumId of albumsToReconcile) {
    scheduleLocalImportBatchCompleteCheck(albumId);
  }

  return foundKeys.size > 0;
}

registerPhotoUpdateBatchApplier(applyPhotoUpdatesBatch);

export function flushPendingPhotoUpdates(): void {
  flushBatchedPhotoUpdates(applyPhotoUpdatesBatch);
}

export function updatePhoto(
  albumId: string,
  photoId: string,
  updater: (photo: CulledAlbumPhoto) => void,
  options?: UpdatePhotoOptions,
): boolean {
  const key = photoKey(albumId, photoId);
  const existsInPhotoState = Boolean(photoStateStore.getState().photoState[key]);

  if (!existsInPhotoState) {
    const existsInAlbum = Boolean(
      getAlbumFromState(albumId)?.photos.some(photo => photo.photoId === photoId),
    );
    if (!existsInAlbum) {
      return false;
    }
  }

  if (options?.immediate) {
    flushPendingPhotoUpdates();
    return applyPhotoUpdatesBatch([{albumId, photoId, updater, options}]);
  }

  schedulePhotoUpdate({albumId, photoId, updater, options}, applyPhotoUpdatesBatch);
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
    syncAlbumTotalsFromRepository(albumId);
    return getAlbumFromState(albumId) ?? existing;
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
  const key = photoKey(albumId, photoId);
  const fromState = photoStateStore.getState().photoState[key];
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
  return photoStateStore.getState().photoState[key];
}

export function queuePhotosForAnalysis(albumId: string): CulledAlbumPhoto[] {
  const photoIds = getPhotoIdsForAlbum(albumId);
  const missingIds = photoIds.filter(
    photoId =>
      !photoStateStore.getState().photoState[photoKey(albumId, photoId)],
  );
  if (missingIds.length > 0) {
    hydratePhotos(albumId, missingIds);
  }

  const uploadedPhotoIds = photoIds.filter(photoId => {
    const photo = getPhotoById(albumId, photoId);
    return photo?.status === 'uploaded';
  });

  for (const photoId of uploadedPhotoIds) {
    updatePhoto(
      albumId,
      photoId,
      entry => {
        entry.analysisProgress = 0;
        entry.analysisStatus = 'pending';
        entry.analysisError = undefined;
      },
      {recomputeTotals: false},
    );
  }

  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (!album) {
      return;
    }
    album.analysisBatchPhotoIds = uploadedPhotoIds;
    album.analysisBatchCounts = createAnalysisBatchCounts(uploadedPhotoIds.length);
    recomputeAlbumTotals(album);
  });

  flushPendingPhotoUpdates();

  return uploadedPhotoIds
    .map(photoId => getPhotoById(albumId, photoId))
    .filter((photo): photo is CulledAlbumPhoto => Boolean(photo));
}

export function clearAnalysisBatch(albumId: string): void {
  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (album) {
      album.analysisBatchPhotoIds = [];
      album.analysisBatchCounts = undefined;
    }
  });
}

export function reconcileAnalysisBatchCounts(albumId: string): void {
  const album = getAlbumFromState(albumId);
  if (!album || album.analysisBatchPhotoIds.length === 0) {
    return;
  }

  const counts = computeAnalysisBatchCountsForIds(
    album.analysisBatchPhotoIds,
    photoId => getPhotoById(albumId, photoId),
  );

  culledAlbumStore.setState(state => {
    const entry = state.albums[albumId];
    if (entry) {
      entry.analysisBatchCounts = counts;
    }
  });
}

export function isAnalysisBatchComplete(albumId: string): boolean {
  const album = getAlbumFromState(albumId);
  if (!album) {
    return false;
  }
  if (album.analysisBatchCounts) {
    return isAnalysisBatchFinishedByCounts(album.analysisBatchCounts);
  }
  return (
    album.analysisBatchPhotoIds.length > 0 &&
    album.analysisBatchPhotoIds.every(photoId => {
      const photo = getPhotoById(albumId, photoId);
      return (
        photo?.analysisStatus === 'analyzed' ||
        photo?.analysisStatus === 'failed'
      );
    })
  );
}
