import {AnalyzePhotoUseCase} from '@/application/useCases/AnalyzePhotoUseCase';
import {cullingEngine} from '@lib/culling/cullingEngine';
import {
  runOrDeferHeavyWorkForNavigation,
  shouldYieldUploadQueueForNavigation,
} from '@lib/navigation/uploadAwareNavigation';
import {FileAsset} from '@services/upload/types';
import {
  isAnalysisBatchFinished,
  isAnalysisBatchFinishedByCounts,
} from './analysisProgress';
import {
  getAlbum,
  flushPendingPhotoUpdates,
  type UpdatePhotoOptions,
} from './store';
import {
  CulledAlbumPhoto,
} from './types';

const ANALYSIS_PERSIST_DEBOUNCE_MS = 3000;
const QUEUE_YIELD_MS = 16;
const PERSIST_BATCH_SIZE = 40;

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
          settled.add(photoId);
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
    if (isSynced(albumId)) {
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
    if (!photo || photo.analysisStatus === 'analyzed') {
      return;
    }

    const fromStatus =
      photo.analysisStatus === 'analyzing' ? 'analyzing' : 'pending';
    getInFlightPhotoIds(albumId).delete(photoId);
    getSettledPhotoIds(albumId).add(photoId);

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
          },
        );
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
        processPending(albumId);
        tryCompleteAlbum(albumId);
      });
  }

  function processPending(albumId: string): void {
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

  return {processPending, tryCompleteAlbum};
}
