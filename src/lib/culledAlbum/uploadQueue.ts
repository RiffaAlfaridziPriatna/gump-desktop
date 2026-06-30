import { copyPhotoToAlbum } from '@lib/localStorage';
import { enrichPhotoCaptureTime } from '@lib/imageCaptureTime';
import { checkLocalImportBatchComplete } from './store';
import { FileAsset } from '@services/upload/types';
import { countByUploadStatus, CulledAlbumPhoto } from './types';

const FAKE_PROGRESS_CAP = 95;
const FAKE_PROGRESS_TICK_MS = 120;
const MIN_VISUAL_PROGRESS_MS = 150;
const PERSIST_BATCH_SIZE = 10;
const COPY_TIMEOUT_MS = 120_000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
      ms,
    );
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export type UploadQueueDeps = {
  maxConcurrent: number;
  getPhotos: (albumId: string) => CulledAlbumPhoto[];
  getPhoto: (albumId: string, photoId: string) => CulledAlbumPhoto | undefined;
  updatePhoto: (
    albumId: string,
    photoId: string,
    updater: (photo: CulledAlbumPhoto) => void,
  ) => boolean;
  persistAlbum: (albumId: string) => Promise<void>;
};

export function createUploadQueue(deps: UploadQueueDeps) {
  const { maxConcurrent, getPhotos, getPhoto, updatePhoto, persistAlbum } =
    deps;
  const completedSincePersistByAlbum = new Map<string, number>();

  function isUploadQueueIdle(albumId: string): boolean {
    return !getPhotos(albumId).some(
      photo => photo.status === 'pending' || photo.status === 'uploading',
    );
  }

  function scheduleAlbumPersist(albumId: string): void {
    const completedSincePersist =
      (completedSincePersistByAlbum.get(albumId) ?? 0) + 1;
    completedSincePersistByAlbum.set(albumId, completedSincePersist);

    const shouldFlush =
      completedSincePersist >= PERSIST_BATCH_SIZE || isUploadQueueIdle(albumId);
    if (!shouldFlush) {
      return;
    }

    completedSincePersistByAlbum.set(albumId, 0);
    void persistAlbum(albumId).catch(error => {
      console.error('[uploadQueue] Failed to persist album', albumId, error);
    });
  }

  function setProgress(albumId: string, photoId: string, progress: number) {
    updatePhoto(albumId, photoId, photo => {
      if (photo.status !== 'failed') {
        photo.progress = progress;
        photo.status = progress >= 100 ? 'uploaded' : 'uploading';
      }
    });
  }

  function failPhoto(albumId: string, photoId: string, error?: string) {
    updatePhoto(albumId, photoId, photo => {
      if (photo.status !== 'uploaded') {
        photo.status = 'failed';
        photo.error = error;
      }
    });
  }

  function uploadPhoto(albumId: string, photoId: string): Promise<void> {
    const photo = getPhoto(albumId, photoId);
    if (!photo) {
      return Promise.reject(new Error('Photo not found'));
    }

    const sourceFile = photo.file;
    const minDurationMs = photo.simulatedMinDurationMs ?? 0;
    const progressDurationMs = Math.max(minDurationMs, MIN_VISUAL_PROGRESS_MS);

    updatePhoto(albumId, photoId, entry => {
      entry.progress = 0;
      entry.status = 'uploading';
      entry.error = undefined;
    });

    let fakeProgress = 0;
    let interval: ReturnType<typeof setInterval> | null = null;
    const startedAt = Date.now();

    return new Promise<void>((resolve, reject) => {
      interval = setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const t = Math.min(1, elapsed / progressDurationMs);
        const eased = 1 - Math.pow(1 - t, 2);
        const target = Math.floor(eased * FAKE_PROGRESS_CAP);
        fakeProgress = Math.max(
          fakeProgress,
          Math.min(FAKE_PROGRESS_CAP, target),
        );
        if (fakeProgress > 0) {
          setProgress(albumId, photoId, fakeProgress);
        }
      }, FAKE_PROGRESS_TICK_MS);

      withTimeout(
        copyPhotoToAlbum(albumId, sourceFile, photoId),
        COPY_TIMEOUT_MS,
        'Local photo copy',
      )
        .then(async (localFile: FileAsset) => {
          if (interval) {
            clearInterval(interval);
          }

          const elapsed = Date.now() - startedAt;
          const remaining = Math.max(0, progressDurationMs - elapsed);
          if (remaining > 0) {
            await sleep(remaining);
          }

          updatePhoto(albumId, photoId, entry => {
            entry.file = localFile;
            entry.progress = 100;
            entry.status = 'uploaded';
          });
          void enrichPhotoCaptureTime(
            albumId,
            photoId,
            localFile.uri,
            sourceFile.capturedAt ?? photo.capturedAt,
          ).catch(error => {
            console.error(
              '[uploadQueue] Failed to enrich capture time',
              albumId,
              photoId,
              error,
            );
          });
          scheduleAlbumPersist(albumId);
          void checkLocalImportBatchComplete(albumId);
          resolve();
        })
        .catch(err => {
          if (interval) {
            clearInterval(interval);
          }
          if (isUploadQueueIdle(albumId)) {
            scheduleAlbumPersist(albumId);
          }
          reject(err);
        });
    });
  }

  function processPending(albumId: string): void {
    let uploadingCount = countByUploadStatus(getPhotos(albumId), 'uploading');

    for (const photo of getPhotos(albumId)) {
      if (uploadingCount >= maxConcurrent) {
        break;
      }
      if (photo.status !== 'pending') {
        continue;
      }

      uploadPhoto(albumId, photo.photoId)
        .then(async () => {
          await checkLocalImportBatchComplete(albumId);
          processPending(albumId);
        })
        .catch(err => {
          const message =
            err instanceof Error && err.message ? err.message : undefined;
          failPhoto(albumId, photo.photoId, message);
          void checkLocalImportBatchComplete(albumId);
          processPending(albumId);
        });
      uploadingCount++;
    }
  }

  return { processPending, failPhoto };
}
