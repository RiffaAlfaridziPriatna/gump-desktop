import {cullingEngine} from '@lib/culling/cullingEngine';
import {FileAsset} from '@services/upload/types';
import {
  getAnalysisBatchPhotos,
  isAnalysisBatchFinished,
} from './analysisProgress';
import {getAlbum} from './store';
import {
  countByAnalysisStatus,
  CulledAlbumPhoto,
} from './types';

const ANALYSIS_PROGRESS_TICK_MS = 150;
const ANALYSIS_FAKE_PROGRESS_CAP = 90;
const ANALYSIS_PERSIST_DEBOUNCE_MS = 3000;

type AnalysisUpdatePhotoOptions = {
  recomputeTotals?: boolean;
};

export type AnalysisQueueDeps = {
  maxConcurrent: number;
  getPhotos: (albumId: string) => CulledAlbumPhoto[];
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
    getPhotos,
    updatePhoto,
    persistAlbum,
    isSynced,
    markSynced,
    unmarkSynced,
    onComplete,
    onError,
  } = deps;
  const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();

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

  function tryCompleteAlbum(albumId: string): void {
    if (isSynced(albumId)) {
      return;
    }

    const album = getAlbum(albumId);
    const batchPhotoIds = album?.analysisBatchPhotoIds ?? [];
    const albumPhotos = getPhotos(albumId);
    const photos = getAnalysisBatchPhotos(albumPhotos, batchPhotoIds);
    if (photos.length === 0) {
      return;
    }
    if (!isAnalysisBatchFinished(albumPhotos, batchPhotoIds)) {
      return;
    }

    const analyzedCount = countByAnalysisStatus(photos, 'analyzed');
    if (analyzedCount === 0) {
      const firstError = photos.find(photo => photo.analysisError)?.analysisError;
      onError(
        albumId,
        firstError ?? 'All photos failed to analyze. Please try again.',
      );
      return;
    }

    markSynced(albumId);
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

  function analyzePhoto(
    albumId: string,
    photoId: string,
    file: FileAsset,
  ): Promise<void> {
    updatePhoto(albumId, photoId, photo => {
      photo.analysisProgress = 0;
      photo.analysisStatus = 'analyzing';
      photo.analysisError = undefined;
    }, {recomputeTotals: false});

    let interval: ReturnType<typeof setInterval> | null = setInterval(() => {
      updatePhoto(albumId, photoId, photo => {
        if (photo.analysisStatus !== 'analyzing') {
          return;
        }
        const next = Math.min(
          ANALYSIS_FAKE_PROGRESS_CAP,
          photo.analysisProgress + 4,
        );
        if (next > photo.analysisProgress) {
          photo.analysisProgress = next;
        }
      }, {recomputeTotals: false});
    }, ANALYSIS_PROGRESS_TICK_MS);

    const stopProgress = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    return cullingEngine
      .analyzePhoto(albumId, photoId, file)
      .then(() => {
        stopProgress();
        updatePhoto(albumId, photoId, photo => {
          photo.analysisProgress = 100;
          photo.analysisStatus = 'analyzed';
        }, {recomputeTotals: false});
        schedulePersist(albumId);
        tryCompleteAlbum(albumId);
      })
      .catch(err => {
        stopProgress();
        throw err;
      });
  }

  function processPending(albumId: string): void {
    let runningCount = countByAnalysisStatus(getPhotos(albumId), 'analyzing');

    for (const photo of getPhotos(albumId)) {
      if (runningCount >= maxConcurrent) {
        break;
      }
      if (photo.analysisStatus !== 'pending') {
        continue;
      }

      runningCount++;
      analyzePhoto(albumId, photo.photoId, photo.file)
        .then(() => processPending(albumId))
        .catch(err => {
          const message =
            err instanceof Error && err.message
              ? err.message
              : 'Analysis failed';
          console.error('[CulledAlbum] Photo analysis failed', photo.photoId, err);
          updatePhoto(albumId, photo.photoId, entry => {
            if (entry.analysisStatus !== 'analyzed') {
              entry.analysisStatus = 'failed';
              entry.analysisError = message;
              entry.analysisProgress = 0;
            }
          }, {recomputeTotals: false});
          schedulePersist(albumId);
          onError(albumId, message);
          tryCompleteAlbum(albumId);
          processPending(albumId);
        });
    }
  }

  return {processPending, tryCompleteAlbum};
}
