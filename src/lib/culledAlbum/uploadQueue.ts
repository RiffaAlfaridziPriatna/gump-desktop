import {copyPhotoToAlbum} from '@lib/localStorage';
import {enrichPhotoCaptureTime} from '@lib/imageCaptureTime';
import {
  isUploadNavigationActive,
  runDeferredDuringUploadNavigation,
  shouldYieldUploadQueueForNavigation,
} from '@lib/navigation/uploadAwareNavigation';
import {checkLocalImportBatchComplete, type UpdatePhotoOptions} from './store';
import {FileAsset} from '@services/upload/types';
import {countByUploadStatus, CulledAlbumPhoto} from './types';

const PERSIST_BATCH_SIZE = 50;
const COPY_TIMEOUT_MS = 120_000;
const QUEUE_YIELD_MS = 32;

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
    options?: UpdatePhotoOptions,
  ) => boolean;
  persistAlbum: (albumId: string) => Promise<void>;
};

export function createUploadQueue(deps: UploadQueueDeps) {
  const {maxConcurrent, getPhotos, getPhoto, updatePhoto, persistAlbum} = deps;
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

  function failPhoto(albumId: string, photoId: string, error?: string) {
    const photo = getPhoto(albumId, photoId);
    if (!photo || photo.status === 'uploaded') {
      return;
    }

    const fromStatus = photo.status === 'uploading' ? 'uploading' : 'pending';
    runDeferredDuringUploadNavigation(() => {
      updatePhoto(
        albumId,
        photoId,
        entry => {
          if (entry.status !== 'uploaded') {
            entry.status = 'failed';
            entry.error = error;
          }
        },
        {
          recomputeTotals: false,
          batchCountShift: {from: fromStatus, to: 'failed'},
        },
      );
    });
  }

  function uploadPhoto(albumId: string, photoId: string): Promise<void> {
    const photo = getPhoto(albumId, photoId);
    if (!photo) {
      return Promise.reject(new Error('Photo not found'));
    }

    const sourceFile = photo.file;

    runDeferredDuringUploadNavigation(() => {
      updatePhoto(
        albumId,
        photoId,
        entry => {
          entry.progress = 0;
          entry.status = 'uploading';
          entry.error = undefined;
        },
        {
          recomputeTotals: false,
          batchCountShift: {from: 'pending', to: 'uploading'},
        },
      );
    });

    const captureTimePromise = enrichPhotoCaptureTime(
      albumId,
      photoId,
      sourceFile.uri,
      sourceFile.capturedAt ?? photo.capturedAt,
    ).catch(error => {
      console.error(
        '[uploadQueue] Failed to enrich capture time',
        albumId,
        photoId,
        error,
      );
      return null;
    });

    return withTimeout(
      Promise.all([
        copyPhotoToAlbum(albumId, sourceFile, photoId),
        captureTimePromise,
      ]),
      COPY_TIMEOUT_MS,
      'Local photo copy',
    )
      .then(async ([localFile]: [FileAsset, number | null]) => {
        runDeferredDuringUploadNavigation(() => {
          updatePhoto(
            albumId,
            photoId,
            entry => {
              entry.file = localFile;
              entry.progress = 100;
              entry.status = 'uploaded';
            },
            {
              recomputeTotals: true,
              batchCountShift: {from: 'uploading', to: 'uploaded'},
            },
          );
        });
        scheduleAlbumPersist(albumId);
        await checkLocalImportBatchComplete(albumId);
      })
      .catch(err => {
        if (isUploadQueueIdle(albumId)) {
          scheduleAlbumPersist(albumId);
        }
        throw err;
      });
  }

  function processPending(albumId: string): void {
    if (shouldYieldUploadQueueForNavigation()) {
      setTimeout(() => processPending(albumId), QUEUE_YIELD_MS);
      return;
    }

    if (isUploadNavigationActive()) {
      runDeferredDuringUploadNavigation(() => processPending(albumId));
      return;
    }

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

  return {processPending, failPhoto};
}
