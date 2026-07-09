import {ImportPhotosUseCase} from '@/application/useCases/ImportPhotosUseCase';
import {syncPhotosFromStore} from '@/application/syncPhotoRepository';
import {copyPhotoToAlbum} from '@lib/storage/localStorage';
import {enrichPhotoCaptureTime} from '@lib/media/imageCaptureTime';
import {
  isUploadNavigationActive,
  runDeferredDuringUploadNavigation,
  runOrDeferHeavyWorkForNavigation,
  shouldYieldUploadQueueForNavigation,
} from '@lib/navigation/uploadAwareNavigation';
import {checkLocalImportBatchComplete, getAlbum, type UpdatePhotoOptions} from './store';
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
  importPhotosUseCase: ImportPhotosUseCase;
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

function getUploadingCount(albumId: string, photos: CulledAlbumPhoto[]): number {
  const counts = getAlbum(albumId)?.localImportBatchCounts;
  if (counts) {
    return counts.uploading;
  }
  return countByUploadStatus(photos, 'uploading');
}

export function createUploadQueue(deps: UploadQueueDeps) {
  const {maxConcurrent, importPhotosUseCase, getPhotos, getPhoto, updatePhoto, persistAlbum} = deps;
  const completedSincePersistByAlbum = new Map<string, number>();
  const pendingPhotoPersistByAlbum = new Map<string, string[]>();

  function queuePhotoPersist(albumId: string, photoId: string): void {
    const pending = pendingPhotoPersistByAlbum.get(albumId) ?? [];
    pending.push(photoId);
    pendingPhotoPersistByAlbum.set(albumId, pending);
  }

  function flushPendingPhotoPersist(albumId: string): void {
    const pending = pendingPhotoPersistByAlbum.get(albumId);
    if (!pending || pending.length === 0) {
      return;
    }
    pendingPhotoPersistByAlbum.set(albumId, []);
    syncPhotosFromStore(albumId, pending);
  }

  function flushAlbumPersist(albumId: string): void {
    completedSincePersistByAlbum.set(albumId, 0);
    flushPendingPhotoPersist(albumId);
    void persistAlbum(albumId).catch(error => {
      console.error('[uploadQueue] Failed to persist album', albumId, error);
    });
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

    runOrDeferHeavyWorkForNavigation(() => flushAlbumPersist(albumId));
  }

  function isUploadQueueIdle(albumId: string): boolean {
    return !getPhotos(albumId).some(
      photo => photo.status === 'pending' || photo.status === 'uploading',
    );
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
    importPhotosUseCase.markUploadFailed(albumId, photoId, error ?? 'Upload failed');
    queuePhotoPersist(albumId, photoId);
  }

  function uploadPhoto(albumId: string, photoId: string): Promise<void> {
    const photo = getPhoto(albumId, photoId);
    if (!photo) {
      return Promise.reject(new Error('Photo not found'));
    }

    const sourceFile = photo.file;
    const previousSize = sourceFile.size ?? 0;

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
    importPhotosUseCase.markUploading(albumId, photoId, 0);

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
        const nextSize = localFile.size ?? 0;
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
              recomputeTotals: false,
              storageDelta: nextSize - previousSize,
              batchCountShift: {from: 'uploading', to: 'uploaded'},
            },
          );
        });
        runOrDeferHeavyWorkForNavigation(() => {
          importPhotosUseCase.markUploaded(albumId, photoId);
          queuePhotoPersist(albumId, photoId);
          scheduleAlbumPersist(albumId);
          void checkLocalImportBatchComplete(albumId);
        });
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

    const photos = getPhotos(albumId);
    let uploadingCount = getUploadingCount(albumId, photos);

    for (const photo of photos) {
      if (uploadingCount >= maxConcurrent) {
        break;
      }
      if (photo.status !== 'pending') {
        continue;
      }

      uploadPhoto(albumId, photo.photoId)
        .then(() => {
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
