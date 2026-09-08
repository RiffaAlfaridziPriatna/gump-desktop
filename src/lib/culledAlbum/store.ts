import {current, isDraft} from 'immer';
import {container} from '@di/container';
import {TOKENS} from '@di/tokens';
import {IPhotoRepository} from '@/domain/repositories/IPhotoRepository';
import {syncPhotosFromStoreAwait} from '@/application/syncPhotoRepository';
import {createCullingPhotoId} from '@lib/culling/cullingPhotoId';
import {reportError} from '@lib/observability/reportError';
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
  computeAnalysisBatchCountsForIds,
  isAnalysisBatchFinishedByCounts,
  mergeAnalysisBatchCounts,
  resolveAnalysisBatchTotal,
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
  AnalysisBatchCounts,
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
import {
  computeKeyFaces,
  computeStats,
  CullFilterKey,
  normalizeCullFilters,
  orderCulledAlbumPhotosForCulling,
} from '@lib/culling/cullingUtil';
import {APIResponse} from '@services/api';
import {getPhotosSnapshot, photoKey, photoStateStore} from './photoStateStore';
import {flushRenderSync, scheduleRenderSync} from './photoRenderStore';
import {gumpPerfMark} from './perfDebug';
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

function toPlainPhoto(photo: CulledAlbumPhoto): CulledAlbumPhoto {
  // Photos copied out of culledAlbumStore can still be Immer drafts.
  return isDraft(photo) ? current(photo) : photo;
}

export function syncPhotoStateForAlbum(
  albumId: string,
  photos: CulledAlbumPhoto[],
): void {
  photoStateStore.setState(state => {
    const nextPhotoIds = photos.map(p => p.photoId);
    const nextIdSet = new Set(nextPhotoIds);

    const prevPhotoIds = state.photoOrder[albumId] ?? [];
    for (const prevPhotoId of prevPhotoIds) {
      if (!nextIdSet.has(prevPhotoId)) {
        delete state.photoState[photoKey(albumId, prevPhotoId)];
      }
    }

    if (photos.length === 0) {
      if (!(albumId in state.photoOrder)) {
        return;
      }
      const photoOrder = {...state.photoOrder};
      delete photoOrder[albumId];
      return {photoOrder};
    }

    for (const photo of photos) {
      const plainPhoto = toPlainPhoto(photo);
      state.photoState[photoKey(albumId, plainPhoto.photoId)] = plainPhoto;
    }

    return {
      photoOrder: {
        ...state.photoOrder,
        [albumId]: nextPhotoIds,
      },
    };
  });
  scheduleRenderSync();
}

function applyAlbumMergeInState(albumId: string, incoming: CulledAlbum): void {
  const mergedPhotos = mergeAlbumPhotos(
    getPhotosSnapshot(albumId),
    incoming.photos,
  );
  if (mergedPhotos.length > 0) {
    syncPhotoStateForAlbum(albumId, mergedPhotos);
  }

  const snapshot = getPhotosSnapshot(albumId);
  culledAlbumStore.setState(state => {
    const current = state.albums[albumId];
    const nextAlbum = current ?? incoming;
    if (!current) {
      state.albums[albumId] = {...incoming, photos: []};
    } else {
      current.totalPhotos = Math.max(current.totalPhotos, incoming.totalPhotos);
      current.totalStorage = Math.max(current.totalStorage, incoming.totalStorage);
    }

    const album = state.albums[albumId]!;
    if (snapshot.length > 0) {
      recomputeAlbumTotals(album, snapshot);
    } else {
      album.totalPhotos = Math.max(album.totalPhotos, nextAlbum.totalPhotos);
      album.totalStorage = Math.max(album.totalStorage, nextAlbum.totalStorage);
    }
  });

  syncAlbumTotalsFromRepository(albumId);
}

async function buildRefreshedAlbum(
  albumId: string,
  persisted?: CulledAlbum | null,
): Promise<CulledAlbum> {
  const active = getAlbumFromState(albumId);
  const activePhotos = getPhotosSnapshot(albumId);
  if (
    hasInFlightUploads(active, activePhotos) ||
    hasInFlightAnalysis(active, activePhotos) ||
    hasInFlightServerUploads(active, activePhotos)
  ) {
    return active!;
  }

  const albumMeta = persisted ?? (await readAlbumMeta(albumId));
  if (!albumMeta) {
    throw new Error(`Album ${albumId} not found locally`);
  }

  let album = normalizePersistedAlbum(albumMeta);

  const inMemoryPhotos = mergeWithMemoryAlbum([], getPhotosSnapshot(albumId));
  album = {...album, photos: inMemoryPhotos};

  const knownPhotoIds = ensurePhotoOrder(albumId);
  const synced = await syncAlbumWithDisk(album, knownPhotoIds);
  album = {
    ...synced.album,
    photos: mergeWithMemoryAlbum(
      synced.album.photos,
      getPhotosSnapshot(albumId),
    ),
  };
  recomputeAlbumTotals(album);
  setPhotoOrder(albumId, synced.photoOrder);
  return album;
}

export async function loadAlbumIntoStore(albumId: string): Promise<CulledAlbum> {
  const active = getAlbumFromState(albumId);
  const activePhotos = getPhotosSnapshot(albumId);
  if (
    hasInFlightUploads(active, activePhotos) ||
    hasInFlightAnalysis(active, activePhotos) ||
    hasInFlightServerUploads(active, activePhotos)
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
    const includePhotos = options.includePhotos ?? false;
    await saveAlbum(toPersistableAlbum(album, {includePhotos}), {
      includePhotos,
    });
  }
}

export async function persistAlbum(
  albumId: string,
  options: PersistAlbumOptions = {},
): Promise<void> {
  try {
    if (shouldDeferHeavyWorkForNavigation()) {
      await new Promise<void>((resolve, reject) => {
        runOrDeferHeavyWorkForNavigation(() => {
          persistAlbumNow(albumId, options).then(resolve).catch(reject);
        });
      });
      return;
    }

    await persistAlbumNow(albumId, options);
  } catch (error) {
    reportError(error, {source: 'persist_album', operation: 'persist_album', albumId});
    throw error;
  }
}

export function syncAlbumTotalsFromRepository(albumId: string): void {
  const photoRepo = container.resolve<IPhotoRepository>(TOKENS.IPhotoRepository);
  const repoPhotoCount = photoRepo.countByUploadStatus(albumId, 'uploaded');
  const repoStorage = photoRepo.sumFileSizeByAlbum(albumId);

  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (!album) {
      return;
    }

    const memoryUploadedCount = getPhotosSnapshot(albumId).reduce(
      (count, photo) => count + (photo.status === 'uploaded' ? 1 : 0),
      0,
    );
    album.totalPhotos = Math.max(repoPhotoCount, memoryUploadedCount);
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
  return photoStateStore.getState().photoState[photoKey(albumId, photoId)];
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
    if (!(albumId in state.photoOrder) && !(albumId in state.gridRevision)) {
      return;
    }
    const photoOrder = {...state.photoOrder};
    const gridRevision = {...state.gridRevision};
    delete photoOrder[albumId];
    delete gridRevision[albumId];
    return {photoOrder, gridRevision};
  });
}

export async function registerLocalAlbum(album: CulledAlbum): Promise<void> {
  syncPhotoStateForAlbum(album.albumId, album.photos);
  culledAlbumStore.setState(state => {
    state.albums[album.albumId] = {...album, photos: []};
  });
  const stored = getAlbumFromState(album.albumId) ?? album;
  await saveAlbum(toPersistableAlbum(stored), {includePhotos: true});
}

export function hasAnyInFlightAlbumWork(): boolean {
  for (const albumId of Object.keys(culledAlbumStore.getState().albums)) {
    const album = getAlbumFromState(albumId);
    if (!album) {
      continue;
    }

    const photos = getPhotosSnapshot(albumId);
    if (hasInFlightUploads(album, photos)) {
      return true;
    }

    if (
      album.analysisBatchPhotoIds.length === 0 &&
      album.uploadBatchPhotoIds.length === 0
    ) {
      continue;
    }
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
      totalPhotos: photoRepo.countByUploadStatus(albumId, 'uploaded'),
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
      const livePhotos = getPhotosSnapshot(albumId);
      if (
        current &&
        (hasInFlightUploads(current, livePhotos) ||
          hasInFlightAnalysis(current, livePhotos) ||
          hasInFlightServerUploads(current, livePhotos))
      ) {
        const snapshot = livePhotos;
        if (snapshot.length > 0) {
          recomputeAlbumTotals(current, snapshot);
        } else if (totals) {
          current.totalPhotos = Math.max(current.totalPhotos, totals.totalPhotos);
          current.totalStorage = Math.max(current.totalStorage, totals.totalStorage);
        }
        continue;
      }
      if (!current) {
        if (hasInFlightUploads(incoming)) {
          incoming.localImportBatchCounts = computeLocalImportBatchCountsForIds(
            incoming.localImportBatchPhotoIds,
            photoId => lookupPhotoForImportCount(albumId, photoId),
          );
        }
        state.albums[albumId] = {...incoming, photos: []};
        continue;
      }
      const snapshot = getPhotosSnapshot(albumId);
      if (snapshot.length > 0) {
        recomputeAlbumTotals(current, snapshot);
      } else if (totals) {
        current.totalPhotos = Math.max(current.totalPhotos, totals.totalPhotos);
        current.totalStorage = Math.max(current.totalStorage, totals.totalStorage);
      }
    }
  });

  for (const albumId of albumIds) {
    const album = getAlbumFromState(albumId);
    if (!album || album.photos.length === 0) {
      continue;
    }
    syncPhotoStateForAlbum(albumId, album.photos);
    culledAlbumStore.setState(state => {
      const entry = state.albums[albumId];
      if (entry) {
        entry.photos = [];
      }
    });
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
  const album = getAlbumFromState(albumId);
  const analyzed = orderCulledAlbumPhotosForCulling(
    albumId,
    getPhotosForAlbum(albumId).filter(
      photo => photo.analysisStatus === 'analyzed',
    ),
  ).map(toCullingPhoto);
  const stats = analyzed.length > 0 ? computeStats(analyzed) : undefined;
  const keyFaces =
    analyzed.length > 0
      ? computeKeyFaces(analyzed, {
          duplicatePhotoGroups: album?.cullingDuplicateGroups,
        })
      : undefined;

  culledAlbumStore.setState(state => {
    const entry = state.albums[albumId];
    if (!entry) {
      return;
    }
    entry.cullingStats = stats;
    entry.cullingKeyFaces = keyFaces;
  });
}

const CULLING_SUMMARY_DEBOUNCE_MS = 3000;
const cullingSummaryTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function scheduleUpdateCullingSummary(albumId: string): void {
  if (cullingSummaryTimers.has(albumId)) {
    return;
  }
  const timer = setTimeout(() => {
    cullingSummaryTimers.delete(albumId);
    updateCullingSummary(albumId);
  }, CULLING_SUMMARY_DEBOUNCE_MS);
  cullingSummaryTimers.set(albumId, timer);
}

export function flushUpdateCullingSummary(albumId: string): void {
  const timer = cullingSummaryTimers.get(albumId);
  if (timer) {
    clearTimeout(timer);
    cullingSummaryTimers.delete(albumId);
  }
  updateCullingSummary(albumId);
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

export function saveLastCullFilters(
  albumId: string,
  filters: Record<CullFilterKey, boolean>,
): void {
  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (!album) {
      return;
    }
    album.lastCullFilters = normalizeCullFilters(filters);
  });
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
  const photoState = photoStateStore.getState().photoState;
  const uploadablePhotoIds: string[] = [];

  for (const photoId of photoIds) {
    const photo = photoState[photoKey(albumId, photoId)];
    if (!photo) {
      continue;
    }
    photo.serverUploadStatus = 'pending';
    photo.serverUploadProgress = 0;
    photo.serverUploadError = undefined;
    uploadablePhotoIds.push(photoId);
  }

  if (uploadablePhotoIds.length === 0) {
    throw new Error('No photos selected for upload');
  }

  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (!album) {
      throw new Error(`Album ${albumId} is not registered locally`);
    }
    album.uploadBatchPhotoIds = uploadablePhotoIds;
  });
}

export async function checkServerUploadBatchComplete(
  albumId: string,
): Promise<void> {
  flushAllPendingPhotoUpdates();

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

  flushAllPendingPhotoUpdates();

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
  culledAlbumStore.setState(state => {
    const entry = state.albums[albumId];
    if (entry) {
      recomputeAlbumTotals(entry, getPhotosSnapshot(albumId));
    }
  });

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

export function pruneCancelledLocalImportPhotos(albumId: string): {
  uploadedPhotoIds: string[];
  removedPhotoIds: string[];
} {
  const removedPhotoIds: string[] = [];
  const uploadedPhotoIds: string[] = [];

  for (const photo of getPhotosSnapshot(albumId)) {
    if (photo.status === 'uploaded') {
      uploadedPhotoIds.push(photo.photoId);
    } else {
      removedPhotoIds.push(photo.photoId);
    }
  }

  if (removedPhotoIds.length > 0) {
    photoStateStore.setState(state => {
      for (const photoId of removedPhotoIds) {
        delete state.photoState[photoKey(albumId, photoId)];
      }

      const photoOrder = {...state.photoOrder};
      const order = photoOrder[albumId];
      if (order) {
        const removed = new Set(removedPhotoIds);
        const nextOrder = order.filter(photoId => !removed.has(photoId));
        if (nextOrder.length === 0) {
          delete photoOrder[albumId];
        } else {
          photoOrder[albumId] = nextOrder;
        }
      }

      return {
        photoOrder,
        gridRevision: {
          ...state.gridRevision,
          [albumId]: (state.gridRevision[albumId] ?? 0) + 1,
        },
      };
    });
  }

  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (!album) {
      return;
    }

    album.localImportBatchPhotoIds = uploadedPhotoIds;
    album.localImportBatchTotal = uploadedPhotoIds.length;
    album.localImportBatchCounts =
      uploadedPhotoIds.length > 0
        ? {
            total: uploadedPhotoIds.length,
            pending: 0,
            uploading: 0,
            uploaded: uploadedPhotoIds.length,
            failed: 0,
          }
        : undefined;
    recomputeAlbumTotals(album, getPhotosSnapshot(albumId));
  });

  return {uploadedPhotoIds, removedPhotoIds};
}

export function getAlbum(albumId: string): CulledAlbum | null {
  return getAlbumFromState(albumId);
}

export function getAlbumTraceContext(
  albumId: string,
): Record<string, string | number | boolean | null> {
  const album = getAlbumFromState(albumId);
  const counts = album?.analysisBatchCounts;
  return {
    albumId,
    photoCount: album?.totalPhotos ?? 0,
    totalStorageBytes: album?.totalStorage ?? 0,
    queuedCount: counts?.total ?? album?.analysisBatchPhotoIds.length ?? 0,
    analyzedCount: counts?.analyzed ?? 0,
    failedCount: counts?.failed ?? 0,
    pendingCount: counts?.pending ?? 0,
    analyzingCount: counts?.analyzing ?? 0,
    cullingCompleted: album?.cullingCompleted ?? false,
  };
}

export function addPhotosToAlbum(
  albumId: string,
  files: FileAsset[],
): CulledAlbumPhoto[] {
  if (!getAlbumFromState(albumId)) {
    throw new Error(`Album ${albumId} is not registered locally`);
  }

  if (files.length === 0) {
    return [];
  }

  const baseUploadedAt = Date.now();
  const addedPhotos: CulledAlbumPhoto[] = files.map((file, index) =>
    createCulledAlbumPhoto(
      file,
      createCullingPhotoId(),
      baseUploadedAt + index,
    ),
  );
  const addedPhotoIds = addedPhotos.map(photo => photo.photoId);
  const nextPhotos = sortPhotosByFilename([
    ...getPhotosSnapshot(albumId),
    ...addedPhotos,
  ]);
  syncPhotoStateForAlbum(albumId, nextPhotos);

  culledAlbumStore.setState(state => {
    const album = state.albums[albumId]!;
    album.localImportBatchPhotoIds = addedPhotoIds;
    album.localImportBatchTotal = addedPhotoIds.length;
    album.localImportBatchCounts = createLocalImportBatchCounts(addedPhotoIds.length);
    recomputeAlbumTotals(album, getPhotosSnapshot(albumId));
  });

  return addedPhotos;
}

function applyPhotoUpdatesBatch(updates: PendingPhotoUpdate[]): boolean {
  if (updates.length === 0) {
    return false;
  }

  const foundKeys = new Set<string>();
  const photoState = photoStateStore.getState().photoState;

  for (const update of updates) {
    const key = photoKey(update.albumId, update.photoId);
    const photo = photoState[key];
    if (!photo) {
      continue;
    }
    update.updater(photo);
    foundKeys.add(key);
  }

  const needsAlbumMeta = updates.some(
    update =>
      update.options?.recomputeTotals ||
      (update.options?.storageDelta ?? 0) !== 0 ||
      Boolean(update.options?.batchCountShift) ||
      Boolean(update.options?.analysisCountShift),
  );

  gumpPerfMark('applyPhotoUpdatesBatch', {
    albumId: updates[0]?.albumId,
    batch: updates.length,
    found: foundKeys.size,
    albumMeta: needsAlbumMeta,
  });

  if (needsAlbumMeta) {
    culledAlbumStore.setState(state => {
      const albumMeta = new Map<
        string,
        {
          storageDelta: number;
          uploadedDelta: number;
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
          meta = {storageDelta: 0, uploadedDelta: 0, recomputeTotals: false};
          albumMeta.set(update.albumId, meta);
        }

        const opts = update.options;
        if (opts?.recomputeTotals) {
          meta.recomputeTotals = true;
        }
        meta.storageDelta += opts?.storageDelta ?? 0;
        const shift = opts?.batchCountShift;
        if (shift?.to === 'uploaded' && shift.from !== 'uploaded') {
          meta.uploadedDelta += 1;
        } else if (shift?.from === 'uploaded' && shift.to !== 'uploaded') {
          meta.uploadedDelta -= 1;
        }
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
          recomputeAlbumTotals(album, getPhotosSnapshot(albumId));
        } else {
          if (meta.storageDelta !== 0) {
            album.totalStorage = Math.max(
              0,
              album.totalStorage + meta.storageDelta,
            );
          }
          if (meta.uploadedDelta !== 0) {
            album.totalPhotos = Math.max(0, album.totalPhotos + meta.uploadedDelta);
          }
        }
      }
    });
  }

  scheduleRenderSync();

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

export function flushAllPendingPhotoUpdates(): void {
  flushBatchedPhotoUpdates(applyPhotoUpdatesBatch, {drain: true});
}

export function updatePhoto(
  albumId: string,
  photoId: string,
  updater: (photo: CulledAlbumPhoto) => void,
  options?: UpdatePhotoOptions,
): boolean {
  const key = photoKey(albumId, photoId);
  if (!photoStateStore.getState().photoState[key]) {
    hydratePhotos(albumId, [photoId]);
    if (!photoStateStore.getState().photoState[key]) {
      return false;
    }
  }

  if (options?.immediate) {
    flushAllPendingPhotoUpdates();
    const applied = applyPhotoUpdatesBatch([{albumId, photoId, updater, options}]);
    flushRenderSync();
    return applied;
  }

  schedulePhotoUpdate({albumId, photoId, updater, options}, applyPhotoUpdatesBatch);
  return true;
}

export function getPhotosForAlbum(albumId: string): CulledAlbumPhoto[] {
  const order = photoStateStore.getState().photoOrder[albumId];
  if (order && order.length > 0) {
    const missingIds = order.filter(
      photoId =>
        !photoStateStore.getState().photoState[photoKey(albumId, photoId)],
    );
    if (missingIds.length > 0) {
      hydratePhotos(albumId, missingIds);
    }
    return getPhotosSnapshot(albumId);
  }

  const photoIds = getPhotoIdsForAlbum(albumId);
  if (photoIds.length === 0) {
    return [];
  }
  hydratePhotos(albumId, photoIds);
  return getPhotosSnapshot(albumId);
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
  let removedFromPhotoState = false;
  photoStateStore.setState(state => {
    const key = photoKey(albumId, photoId);
    if (state.photoState[key]) {
      delete state.photoState[key];
      removedFromPhotoState = true;
    }

    const photoOrder = {...state.photoOrder};
    const order = photoOrder[albumId];
    if (order) {
      const nextOrder = order.filter(id => id !== photoId);
      if (nextOrder.length !== order.length) {
        if (nextOrder.length === 0) {
          delete photoOrder[albumId];
        } else {
          photoOrder[albumId] = nextOrder;
        }
        removedFromPhotoState = true;
      }
    }

    if (!removedFromPhotoState) {
      return;
    }

    return {
      photoOrder,
      gridRevision: {
        ...state.gridRevision,
        [albumId]: (state.gridRevision[albumId] ?? 0) + 1,
      },
    };
  });

  if (removedFromPhotoState) {
    culledAlbumStore.setState(state => {
      const album = state.albums[albumId];
      if (!album) {
        return;
      }
      recomputeAlbumTotals(album, getPhotosSnapshot(albumId));
    });
  }

  return removedFromPhotoState;
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

  hydratePhotos(albumId, [photoId]);
  return photoStateStore.getState().photoState[key];
}

export function queuePhotosForAnalysis(albumId: string): number {
  const photoIds = getPhotoIdsForAlbum(albumId);
  const photoState = photoStateStore.getState().photoState;
  const missingIds = photoIds.filter(
    photoId => !photoState[photoKey(albumId, photoId)],
  );
  if (missingIds.length > 0) {
    hydratePhotos(albumId, missingIds);
  }

  const nextPhotoState = photoStateStore.getState().photoState;
  const uploadedPhotoIds: string[] = [];
  let pending = 0;
  let analyzed = 0;

  for (const photoId of photoIds) {
    const photo = nextPhotoState[photoKey(albumId, photoId)];
    if (!photo || photo.status !== 'uploaded') {
      continue;
    }
    uploadedPhotoIds.push(photoId);
    if (photo.analysisStatus === 'analyzed') {
      analyzed += 1;
      continue;
    }
    photo.analysisProgress = 0;
    photo.analysisStatus = 'pending';
    photo.analysisError = undefined;
    pending += 1;
  }

  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (!album) {
      return;
    }
    album.analysisBatchPhotoIds = uploadedPhotoIds;
    album.analysisBatchCounts = {
      total: uploadedPhotoIds.length,
      pending,
      analyzing: 0,
      analyzed,
      failed: 0,
    };
  });

  return uploadedPhotoIds.length;
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

export function setAnalysisBatchCounts(
  albumId: string,
  counts: AnalysisBatchCounts,
): void {
  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (!album) {
      return;
    }
    const knownTotal = resolveAnalysisBatchTotal(
      counts.total,
      album.analysisBatchPhotoIds.length,
      album.analysisBatchCounts?.total ?? 0,
    );
    if (knownTotal <= 0) {
      return;
    }
    album.analysisBatchCounts = mergeAnalysisBatchCounts(
      album.analysisBatchCounts,
      {
        ...counts,
        total: knownTotal,
      },
    );
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
