import {AnalyzePhotoUseCase} from '@/application/useCases/AnalyzePhotoUseCase';
import {clearScheduledAnalyzedPhotoAssets} from '@lib/culling/analyzedPhotoAssets';
import {cullingEngine} from '@lib/culling/cullingEngine';
import {
  runOrDeferHeavyWorkForNavigation,
  shouldYieldUploadQueueForNavigation,
} from '@lib/navigation/uploadAwareNavigation';
import {FileAsset} from '@services/upload/types';
import {Platform} from 'react-native';
import {
  isAnalysisBatchFinished,
  isAnalysisBatchFinishedByCounts,
} from './analysisProgress';
import {
  cancelNativeAnalysis,
  isNativeAnalysisSupported,
  startNativeAnalysis,
  subscribeToNativeAnalysis,
  unsubscribeFromNativeAnalysis,
  type AnalysisCompleteEvent,
} from './nativeAnalysisSession';
import {
  getAlbum,
  flushPendingPhotoUpdates,
  reconcileAnalysisBatchCounts,
  scheduleUpdateCullingSummary,
  setAnalysisBatchCounts,
  type UpdatePhotoOptions,
} from './store';
import {
  CulledAlbumPhoto,
} from './types';

const ANALYSIS_PERSIST_DEBOUNCE_MS = 3000;
const QUEUE_YIELD_MS = Platform.OS === 'windows' ? 32 : 16;
const PERSIST_BATCH_SIZE = Platform.OS === 'windows' ? 20 : 40;

type AnalysisUpdatePhotoOptions = UpdatePhotoOptions;

export type AnalysisQueueDeps = {
  maxConcurrent: number;
  analyzePhotoUseCase: AnalyzePhotoUseCase;
  getPhotos: (albumId: string) => CulledAlbumPhoto[];
  getPhoto: (albumId: string, photoId: string) => CulledAlbumPhoto | undefined;
  updatePhoto: (
    albumId: string,
    photoId: string,
    updater: (photo: CulledAlbumPhoto) => void,
    options?: AnalysisUpdatePhotoOptions,
  ) => boolean;
  persistAlbum: (albumId: string) => Promise<void>;
  isSynced: (albumId: string) => boolean;
  markSynced: (albumId: string) => void;
  unmarkSynced: (albumId: string) => void;
  onComplete: (albumId: string) => Promise<void>;
  onError: (albumId: string, message: string) => void;
};

export function createAnalysisQueue(deps: AnalysisQueueDeps) {
  const {
    maxConcurrent,
    analyzePhotoUseCase,
    getPhotos,
    getPhoto,
    updatePhoto,
    persistAlbum,
    isSynced,
    markSynced,
    unmarkSynced,
    onComplete,
    onError,
  } = deps;

  const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const activeAnalysisByAlbum = new Map<string, number>();
  const inFlightPhotoIdsByAlbum = new Map<string, Set<string>>();
  const settledPhotoIdsByAlbum = new Map<string, Set<string>>();
  const pendingCursorByAlbum = new Map<string, number>();
  const batchSignatureByAlbum = new Map<string, string>();
  const completedSincePersistByAlbum = new Map<string, number>();
  const pendingPhotoPersistByAlbum = new Map<string, string[]>();
  const cancelGenerationByAlbum = new Map<string, number>();
  const cancelledAlbums = new Set<string>();
  const batchStartedAtByAlbum = new Map<string, number>();
  const nativeSessionAlbums = new Set<string>();
  const nativeStartInFlight = new Set<string>();

  function getCancelGeneration(albumId: string): number {
    return cancelGenerationByAlbum.get(albumId) ?? 0;
  }

  function bumpCancelGeneration(albumId: string): number {
    const next = getCancelGeneration(albumId) + 1;
    cancelGenerationByAlbum.set(albumId, next);
    return next;
  }

  function beginBatch(albumId: string): void {
    cancelledAlbums.delete(albumId);
    bumpCancelGeneration(albumId);
    settledPhotoIdsByAlbum.delete(albumId);
    pendingCursorByAlbum.delete(albumId);
    batchSignatureByAlbum.delete(albumId);
    nativeSessionAlbums.delete(albumId);
    nativeStartInFlight.delete(albumId);
    batchStartedAtByAlbum.set(albumId, Date.now());
  }

  function isCancelled(albumId: string, generation?: number): boolean {
    if (cancelledAlbums.has(albumId)) {
      return true;
    }
    if (generation !== undefined && generation !== getCancelGeneration(albumId)) {
      return true;
    }
    return false;
  }

  function getInFlightPhotoIds(albumId: string): Set<string> {
    let ids = inFlightPhotoIdsByAlbum.get(albumId);
    if (!ids) {
      ids = new Set<string>();
      inFlightPhotoIdsByAlbum.set(albumId, ids);
    }
    return ids;
  }

  function getSettledPhotoIds(albumId: string): Set<string> {
    let ids = settledPhotoIdsByAlbum.get(albumId);
    if (!ids) {
      ids = new Set<string>();
      settledPhotoIdsByAlbum.set(albumId, ids);
    }
    return ids;
  }

  function getActiveAnalysisCount(albumId: string): number {
    return activeAnalysisByAlbum.get(albumId) ?? 0;
  }

  function trackActiveAnalysis(albumId: string, delta: number): void {
    const next = Math.max(0, getActiveAnalysisCount(albumId) + delta);
    if (next === 0) {
      activeAnalysisByAlbum.delete(albumId);
      return;
    }
    activeAnalysisByAlbum.set(albumId, next);
  }

  function getBatchSignature(albumId: string): string {
    const album = getAlbum(albumId);
    const ids = album?.analysisBatchPhotoIds ?? [];
    if (ids.length === 0) {
      return '';
    }
    return `${ids.length}:${ids[0]}:${ids[ids.length - 1]}`;
  }

  function getPendingPhotoIds(albumId: string): string[] {
    const batchPhotoIds = getAlbum(albumId)?.analysisBatchPhotoIds ?? [];
    if (batchPhotoIds.length > 0) {
      return batchPhotoIds;
    }

    return getPhotos(albumId)
      .filter(photo => photo.analysisStatus === 'pending')
      .map(photo => photo.photoId);
  }

  function findNextPendingIndex(
    albumId: string,
    photoIds: string[],
    startIndex: number,
  ): number {
    const inFlight = getInFlightPhotoIds(albumId);
    const settled = getSettledPhotoIds(albumId);

    const scan = (from: number, to: number): number => {
      for (let index = from; index < to; index++) {
        const photoId = photoIds[index]!;
        if (inFlight.has(photoId) || settled.has(photoId)) {
          continue;
        }
        const photo = getPhoto(albumId, photoId);
        if (!photo) {
          console.warn(
            '[analysisQueue] Photo not found in store, marking as failed',
            {albumId, photoId},
          );
          failPhoto(albumId, photoId, 'Photo data not found');
          continue;
        }
        if (
          photo.analysisStatus === 'analyzed' ||
          photo.analysisStatus === 'failed'
        ) {
          settled.add(photoId);
          continue;
        }
        if (
          photo.analysisStatus === 'pending' ||
          photo.analysisStatus === 'analyzing'
        ) {
          return index;
        }
      }
      return -1;
    };

    const forward = scan(startIndex, photoIds.length);
    if (forward >= 0) {
      return forward;
    }
    return scan(0, startIndex);
  }

  function schedulePersist(albumId: string): void {
    if (persistTimers.has(albumId)) {
      return;
    }

    const timer = setTimeout(() => {
      persistTimers.delete(albumId);
      persistAlbum(albumId).catch(err => {
        console.error('[CulledAlbum] Failed to persist analysis progress', err);
      });
    }, ANALYSIS_PERSIST_DEBOUNCE_MS);

    persistTimers.set(albumId, timer);
  }

  async function flushPersist(albumId: string): Promise<void> {
    const timer = persistTimers.get(albumId);
    if (timer) {
      clearTimeout(timer);
      persistTimers.delete(albumId);
    }
    await persistAlbum(albumId);
  }

  function queuePhotoPersist(albumId: string, photoId: string): void {
    const pending = pendingPhotoPersistByAlbum.get(albumId) ?? [];
    pending.push(photoId);
    pendingPhotoPersistByAlbum.set(albumId, pending);

    const completed = (completedSincePersistByAlbum.get(albumId) ?? 0) + 1;
    completedSincePersistByAlbum.set(albumId, completed);

    if (completed >= PERSIST_BATCH_SIZE) {
      flushPhotoPersists(albumId);
    }
  }

  function flushPhotoPersists(albumId: string): void {
    const pending = pendingPhotoPersistByAlbum.get(albumId);
    if (!pending || pending.length === 0) {
      return;
    }
    pendingPhotoPersistByAlbum.delete(albumId);
    completedSincePersistByAlbum.set(albumId, 0);

    runOrDeferHeavyWorkForNavigation(() => {
      for (const photoId of pending) {
        analyzePhotoUseCase.markAnalyzed(albumId, photoId);
      }
    });
  }

  function tryCompleteAlbum(albumId: string): void {
    if (isCancelled(albumId) || isSynced(albumId)) {
      return;
    }

    if (getActiveAnalysisCount(albumId) > 0) {
      return;
    }

    flushPendingPhotoUpdates();

    const album = getAlbum(albumId);
    const batchPhotoIds = album?.analysisBatchPhotoIds ?? [];
    if (batchPhotoIds.length === 0) {
      return;
    }

    if (album?.analysisBatchCounts) {
      if (!isAnalysisBatchFinishedByCounts(album.analysisBatchCounts)) {
        return;
      }
    } else {
      const albumPhotos = getPhotos(albumId);
      if (!isAnalysisBatchFinished(albumPhotos, batchPhotoIds)) {
        return;
      }
    }

    const analyzedCount =
      album?.analysisBatchCounts?.analyzed ??
      batchPhotoIds.reduce((count, photoId) => {
        const photo = getPhoto(albumId, photoId);
        return photo?.analysisStatus === 'analyzed' ? count + 1 : count;
      }, 0);

    if (analyzedCount === 0) {
      const firstError = batchPhotoIds
        .map(photoId => getPhoto(albumId, photoId)?.analysisError)
        .find(Boolean);
      onError(
        albumId,
        firstError ?? 'All photos failed to analyze. Please try again.',
      );
      return;
    }

    markSynced(albumId);
    flushPhotoPersists(albumId);

    const batchStartedAt = batchStartedAtByAlbum.get(albumId);
    batchStartedAtByAlbum.delete(albumId);
    if (__DEV__ && batchStartedAt != null && analyzedCount > 0) {
      const elapsedMs = Math.max(1, Date.now() - batchStartedAt);
      const photosPerSec = (analyzedCount * 1000) / elapsedMs;
      console.log(
        `[CulledAlbum] analysis batch done album=${albumId} analyzed=${analyzedCount} elapsedMs=${elapsedMs} photosPerSec=${photosPerSec.toFixed(2)} concurrency=${maxConcurrent}`,
      );
    }

    flushPersist(albumId)
      .then(() => onComplete(albumId))
      .catch(err => {
        unmarkSynced(albumId);
        const message =
          err instanceof Error ? err.message : 'Failed to complete culling analysis';
        onError(albumId, message);
        console.error('[CulledAlbum] Failed to complete culling analysis', err);
      });
  }

  function failPhoto(albumId: string, photoId: string, error?: string): void {
    const photo = getPhoto(albumId, photoId);
    
    getInFlightPhotoIds(albumId).delete(photoId);
    getSettledPhotoIds(albumId).add(photoId);

    if (!photo) {
      // Photo not in store - still mark as failed via use case for tracking
      analyzePhotoUseCase.markFailed(albumId, photoId, error ?? 'Photo data not found');
      return;
    }

    if (
      photo.analysisStatus === 'analyzed' ||
      photo.analysisStatus === 'failed'
    ) {
      return;
    }

    const fromStatus =
      photo.analysisStatus === 'analyzing' ? 'analyzing' : 'pending';

    updatePhoto(
      albumId,
      photoId,
      entry => {
        if (entry.analysisStatus !== 'analyzed') {
          entry.analysisStatus = 'failed';
          entry.analysisError = error ?? 'Analysis failed';
          entry.analysisProgress = 0;
        }
      },
      {
        recomputeTotals: false,
        analysisCountShift: {from: fromStatus, to: 'failed'},
      },
    );
    analyzePhotoUseCase.markFailed(albumId, photoId, error ?? 'Analysis failed');
    schedulePersist(albumId);
  }

  function analyzePhoto(
    albumId: string,
    photoId: string,
    file: FileAsset,
  ): Promise<void> {
    const generation = getCancelGeneration(albumId);
    const existing = getPhoto(albumId, photoId);
    const fromStatus =
      existing?.analysisStatus === 'analyzing' ? 'analyzing' : 'pending';
    const inFlight = getInFlightPhotoIds(albumId);
    inFlight.add(photoId);
    trackActiveAnalysis(albumId, 1);

    updatePhoto(
      albumId,
      photoId,
      photo => {
        photo.analysisProgress = 0;
        photo.analysisStatus = 'analyzing';
        photo.analysisError = undefined;
      },
      {
        recomputeTotals: false,
        ...(fromStatus === 'pending'
          ? {analysisCountShift: {from: 'pending', to: 'analyzing'} as const}
          : {}),
      },
    );
    runOrDeferHeavyWorkForNavigation(() => {
      analyzePhotoUseCase.startAnalysis(albumId, photoId);
    });

    return cullingEngine
      .analyzePhoto(albumId, photoId, file)
      .then(() => {
        if (isCancelled(albumId, generation)) {
          getSettledPhotoIds(albumId).add(photoId);
          return;
        }
        getSettledPhotoIds(albumId).add(photoId);
        updatePhoto(
          albumId,
          photoId,
          photo => {
            photo.analysisProgress = 100;
            photo.analysisStatus = 'analyzed';
          },
          {
            recomputeTotals: false,
            analysisCountShift: {from: 'analyzing', to: 'analyzed'},
            immediate: true,
          },
        );
        scheduleUpdateCullingSummary(albumId);
        runOrDeferHeavyWorkForNavigation(() => {
          queuePhotoPersist(albumId, photoId);
          schedulePersist(albumId);
        });
      })
      .catch(err => {
        throw err;
      })
      .finally(() => {
        inFlight.delete(photoId);
        trackActiveAnalysis(albumId, -1);
        if (!isCancelled(albumId, generation)) {
          processPending(albumId);
          tryCompleteAlbum(albumId);
        }
      });
  }

  function waitForActiveAnalysis(albumId: string): Promise<void> {
    return new Promise(resolve => {
      const tick = () => {
        if (getActiveAnalysisCount(albumId) === 0) {
          resolve();
          return;
        }
        setTimeout(tick, 32);
      };
      tick();
    });
  }

  function yieldToMain(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  function requestCancel(albumId: string): void {
    if (cancelledAlbums.has(albumId)) {
      return;
    }
    bumpCancelGeneration(albumId);
    cancelledAlbums.add(albumId);
    clearScheduledAnalyzedPhotoAssets(albumId);
    if (nativeSessionAlbums.has(albumId) || nativeStartInFlight.has(albumId)) {
      nativeSessionAlbums.delete(albumId);
      nativeStartInFlight.delete(albumId);
      unsubscribeFromNativeAnalysis();
      void cancelNativeAnalysis();
      const active = getActiveAnalysisCount(albumId);
      if (active > 0) {
        trackActiveAnalysis(albumId, -active);
      }
    }
  }

  async function failQueuedAnalysis(
    albumId: string,
    error: string,
    skipInFlight: boolean,
  ): Promise<void> {
    const inFlight = getInFlightPhotoIds(albumId);
    const batchPhotoIds = getAlbum(albumId)?.analysisBatchPhotoIds ?? [];
    const photoIds =
      batchPhotoIds.length > 0
        ? batchPhotoIds
        : getPhotos(albumId)
            .filter(photo => photo.analysisStatus !== 'analyzed')
            .map(photo => photo.photoId);

    for (let index = 0; index < photoIds.length; index++) {
      const photoId = photoIds[index]!;
      if (skipInFlight && inFlight.has(photoId)) {
        continue;
      }
      const photo = getPhoto(albumId, photoId);
      if (
        !photo ||
        photo.analysisStatus === 'analyzed' ||
        photo.analysisStatus === 'failed'
      ) {
        continue;
      }
      failPhoto(albumId, photoId, error);
      if (index > 0 && index % 40 === 0) {
        await yieldToMain();
      }
    }
  }

  async function cancel(
    albumId: string,
    error = 'Analysis cancelled',
  ): Promise<void> {
    requestCancel(albumId);
    await failQueuedAnalysis(albumId, error, true);
    await waitForActiveAnalysis(albumId);
    await failQueuedAnalysis(albumId, error, false);
    flushPendingPhotoUpdates();
    schedulePersist(albumId);
  }

  function finishNativeSession(
    albumId: string,
    generation: number,
    event: AnalysisCompleteEvent,
  ): void {
    unsubscribeFromNativeAnalysis();
    nativeSessionAlbums.delete(albumId);
    nativeStartInFlight.delete(albumId);
    const active = getActiveAnalysisCount(albumId);
    if (active > 0) {
      trackActiveAnalysis(albumId, -active);
    }

    if (isCancelled(albumId, generation)) {
      return;
    }

    const results = event.results ?? [];
    cullingEngine.ingestNativeSessionResults(albumId, results);

    const resultIds = new Set(results.map(result => result.photoId));
    for (const result of results) {
      getSettledPhotoIds(albumId).add(result.photoId);
      if (result.success) {
        queuePhotoPersist(albumId, result.photoId);
      }
    }

    for (const photoId of getPendingPhotoIds(albumId)) {
      if (resultIds.has(photoId)) {
        continue;
      }
      const photo = getPhoto(albumId, photoId);
      if (
        photo &&
        photo.analysisStatus !== 'analyzed' &&
        photo.analysisStatus !== 'failed'
      ) {
        failPhoto(albumId, photoId, 'Native analysis did not return a result');
      }
    }

    reconcileAnalysisBatchCounts(albumId);
    tryCompleteAlbum(albumId);
  }

  async function startNativeSession(albumId: string): Promise<boolean> {
    if (!isNativeAnalysisSupported()) {
      return false;
    }

    const pendingPhotoIds = getPendingPhotoIds(albumId);
    const photos = pendingPhotoIds
      .map(photoId => getPhoto(albumId, photoId))
      .filter((photo): photo is CulledAlbumPhoto => {
        if (!photo) {
          return false;
        }
        return (
          photo.analysisStatus === 'pending' || photo.analysisStatus === 'failed'
        );
      });

    if (photos.length === 0) {
      return false;
    }

    const generation = getCancelGeneration(albumId);
    nativeSessionAlbums.add(albumId);
    trackActiveAnalysis(albumId, 1);

    subscribeToNativeAnalysis(
      progress => {
        if (isCancelled(albumId, generation)) {
          return;
        }
        setAnalysisBatchCounts(albumId, {
          total: progress.total,
          pending: Math.max(0, progress.total - progress.done - progress.failed),
          analyzing: 0,
          analyzed: progress.done,
          failed: progress.failed,
        });
      },
      event => {
        finishNativeSession(albumId, generation, event);
      },
    );

    try {
      await startNativeAnalysis(albumId, photos, {maxConcurrency});
      return true;
    } catch (error) {
      unsubscribeFromNativeAnalysis();
      nativeSessionAlbums.delete(albumId);
      const active = getActiveAnalysisCount(albumId);
      if (active > 0) {
        trackActiveAnalysis(albumId, -active);
      }
      console.warn(
        '[CulledAlbum] Native analysis failed, falling back to JS queue',
        error,
      );
      return false;
    }
  }

  function processPendingJs(albumId: string): void {
    if (isCancelled(albumId)) {
      return;
    }

    if (shouldYieldUploadQueueForNavigation()) {
      setTimeout(() => processPending(albumId), QUEUE_YIELD_MS);
      return;
    }

    const batchSignature = getBatchSignature(albumId);
    if (batchSignatureByAlbum.get(albumId) !== batchSignature) {
      batchSignatureByAlbum.set(albumId, batchSignature);
      pendingCursorByAlbum.set(albumId, 0);
      settledPhotoIdsByAlbum.delete(albumId);
    }

    const pendingPhotoIds = getPendingPhotoIds(albumId);
    if (pendingPhotoIds.length === 0) {
      return;
    }

    let cursor = pendingCursorByAlbum.get(albumId) ?? 0;
    if (cursor >= pendingPhotoIds.length) {
      cursor = findNextPendingIndex(albumId, pendingPhotoIds, 0);
      if (cursor < 0) {
        return;
      }
    }

    let slotsUsed = getActiveAnalysisCount(albumId);
    let started = 0;

    while (slotsUsed < maxConcurrent) {
      const nextIndex = findNextPendingIndex(albumId, pendingPhotoIds, cursor);
      if (nextIndex < 0) {
        cursor = pendingPhotoIds.length;
        break;
      }

      cursor = nextIndex + 1;
      const photoId = pendingPhotoIds[nextIndex]!;
      const photo = getPhoto(albumId, photoId);
      if (!photo) {
        getSettledPhotoIds(albumId).add(photoId);
        continue;
      }

      analyzePhoto(albumId, photoId, photo.file).catch(err => {
        const message =
          err instanceof Error && err.message
            ? err.message
            : 'Analysis failed';
        console.error('[CulledAlbum] Photo analysis failed', photoId, err);
        failPhoto(albumId, photoId, message);
      });
      slotsUsed++;
      started++;
    }

    pendingCursorByAlbum.set(albumId, cursor);

    if (started === 0 && getActiveAnalysisCount(albumId) === 0) {
      const retryIndex = findNextPendingIndex(albumId, pendingPhotoIds, 0);
      if (retryIndex < 0) {
        tryCompleteAlbum(albumId);
        return;
      }

      pendingCursorByAlbum.set(albumId, retryIndex);
      setTimeout(() => processPending(albumId), QUEUE_YIELD_MS);
    }
  }

  function processPending(albumId: string): void {
    if (isCancelled(albumId)) {
      return;
    }
    if (nativeSessionAlbums.has(albumId) || nativeStartInFlight.has(albumId)) {
      return;
    }

    if (!isNativeAnalysisSupported()) {
      processPendingJs(albumId);
      return;
    }

    nativeStartInFlight.add(albumId);
    void startNativeSession(albumId).then(started => {
      nativeStartInFlight.delete(albumId);
      if (started || isCancelled(albumId)) {
        return;
      }
      processPendingJs(albumId);
    });
  }

  return {beginBatch, requestCancel, cancel, processPending, tryCompleteAlbum};
}
