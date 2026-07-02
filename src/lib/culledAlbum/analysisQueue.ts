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

export type AnalysisQueueDeps = {
  maxConcurrent: number;
  getPhotos: (albumId: string) => CulledAlbumPhoto[];
  updatePhoto: (
    albumId: string,
    photoId: string,
    updater: (photo: CulledAlbumPhoto) => void,
  ) => boolean;
  persistAlbum: (albumId: string) => Promise<void>;
  isSynced: (albumId: string) => boolean;
  markSynced: (albumId: string) => void;
  unmarkSynced: (albumId: string) => void;
  onComplete: (albumId: string) => Promise<void>;
  onError: (message: string) => void;
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
      onError(firstError ?? 'All photos failed to analyze. Please try again.');
      return;
    }

    markSynced(albumId);
    void onComplete(albumId).catch(err => {
      unmarkSynced(albumId);
      const message =
        err instanceof Error ? err.message : 'Failed to complete culling analysis';
      onError(message);
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
    });

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
      });
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
        });
        void persistAlbum(albumId);
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
          });
          onError(message);
          tryCompleteAlbum(albumId);
          processPending(albumId);
        });
    }
  }

  return {processPending, tryCompleteAlbum};
}
