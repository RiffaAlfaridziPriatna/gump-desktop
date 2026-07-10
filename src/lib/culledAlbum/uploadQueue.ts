import {ImportPhotosUseCase} from '@/application/useCases/ImportPhotosUseCase';
import {syncPhotosFromStoreAwait} from '@/application/syncPhotoRepository';
import {copyPhotoToAlbum} from '@lib/storage/localStorage';
import {enrichPhotoCaptureTime} from '@lib/media/imageCaptureTime';
import {
  runOrDeferHeavyWorkForNavigation,
  shouldYieldUploadQueueForNavigation,
} from '@lib/navigation/uploadAwareNavigation';
import {
  getAlbum,
  scheduleLocalImportBatchCompleteCheck,
  type UpdatePhotoOptions,
} from './store';
import {FileAsset} from '@services/upload/types';
import {CulledAlbumPhoto} from './types';

const PERSIST_BATCH_SIZE = 40;
const COPY_TIMEOUT_MS = 120_000;
const QUEUE_YIELD_MS = 16;

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

export function createUploadQueue(deps: UploadQueueDeps) {
  const {maxConcurrent, importPhotosUseCase, getPhotos, getPhoto, updatePhoto, persistAlbum} = deps;
  const completedSincePersistByAlbum = new Map<string, number>();
  const pendingPhotoPersistByAlbum = new Map<string, string[]>();
  const activeUploadsByAlbum = new Map<string, number>();
  const inFlightPhotoIdsByAlbum = new Map<string, Set<string>>();
  const settledPhotoIdsByAlbum = new Map<string, Set<string>>();
  const pendingCursorByAlbum = new Map<string, number>();
  const batchSignatureByAlbum = new Map<string, string>();

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

  function getBatchSignature(albumId: string): string {
    const album = getAlbum(albumId);
    const ids = album?.localImportBatchPhotoIds ?? [];
    if (ids.length === 0) {
      return '';
    }
    return `${ids.length}:${ids[0]}:${ids[ids.length - 1]}`;
  }

  function getPendingPhotoIds(albumId: string): string[] {
    const batchPhotoIds = getAlbum(albumId)?.localImportBatchPhotoIds ?? [];
    if (batchPhotoIds.length > 0) {
      return batchPhotoIds;
    }

    return getPhotos(albumId)
      .filter(photo => photo.status === 'pending')
      .map(photo => photo.photoId);
  }

  function findNextPendingIndex(
    albumId: string,
    photoIds: string[],
    startIndex: number,
  ): number {
    const inFlight = getInFlightPhotoIds(albumId);
    const settled = getSettledPhotoIds(albumId);

    for (let index = startIndex; index < photoIds.length; index++) {
      const photoId = photoIds[index]!;
      if (inFlight.has(photoId) || settled.has(photoId)) {
        continue;
      }
      const photo = getPhoto(albumId, photoId);
      if (!photo || photo.status === 'pending') {
        return index;
      }
    }

    for (let index = 0; index < startIndex; index++) {
      const photoId = photoIds[index]!;
      if (inFlight.has(photoId) || settled.has(photoId)) {
        continue;
      }
      const photo = getPhoto(albumId, photoId);
      if (!photo || photo.status === 'pending') {
        return index;
      }
    }

    return -1;
  }

  function getActiveUploadCount(albumId: string): number {
    return activeUploadsByAlbum.get(albumId) ?? 0;
  }

  function trackActiveUpload(albumId: string, delta: number): void {
    const next = Math.max(0, getActiveUploadCount(albumId) + delta);
    if (next === 0) {
      activeUploadsByAlbum.delete(albumId);
      return;
    }
    activeUploadsByAlbum.set(albumId, next);
  }

  function queuePhotoPersist(albumId: string, photoId: string): void {
    const pending = pendingPhotoPersistByAlbum.get(albumId) ?? [];
    pending.push(photoId);
    pendingPhotoPersistByAlbum.set(albumId, pending);
  }

  function flushAlbumPersist(albumId: string): void {
    completedSincePersistByAlbum.set(albumId, 0);
    const pending = pendingPhotoPersistByAlbum.get(albumId) ?? [];
    pendingPhotoPersistByAlbum.set(albumId, []);

    void (async () => {
      try {
        if (pending.length > 0) {
          await syncPhotosFromStoreAwait(albumId, pending);
        }
        if (isUploadQueueIdle(albumId)) {
          await persistAlbum(albumId);
        }
      } catch (error) {
        console.error('[uploadQueue] Failed to persist album', albumId, error);
      }
    })();
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
    if (getActiveUploadCount(albumId) > 0) {
      return false;
    }

    const album = getAlbum(albumId);
    const counts = album?.localImportBatchCounts;
    if (counts) {
      return counts.pending === 0 && counts.uploading === 0;
    }

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
    getInFlightPhotoIds(albumId).delete(photoId);
    getSettledPhotoIds(albumId).add(photoId);
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
    const inFlight = getInFlightPhotoIds(albumId);
    inFlight.add(photoId);

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
    importPhotosUseCase.markUploading(albumId, photoId, 0);
    trackActiveUpload(albumId, 1);

    return withTimeout(
      copyPhotoToAlbum(albumId, sourceFile, photoId),
      COPY_TIMEOUT_MS,
      'Local photo copy',
    )
      .then(async (localFile: FileAsset) => {
        const nextSize = localFile.size ?? 0;
        getSettledPhotoIds(albumId).add(photoId);
        updatePhoto(
          albumId,
          photoId,
          entry => {
            entry.file = {
              ...localFile,
              name: entry.file.name,
            };
            entry.progress = 100;
            entry.status = 'uploaded';
          },
          {
            recomputeTotals: false,
            storageDelta: nextSize - previousSize,
            batchCountShift: {from: 'uploading', to: 'uploaded'},
          },
        );
        void enrichPhotoCaptureTime(
          albumId,
          photoId,
          sourceFile.uri,
          sourceFile.capturedAt ?? photo.capturedAt,
        ).catch(captureError => {
          console.error(
            '[uploadQueue] Failed to enrich capture time',
            albumId,
            photoId,
            captureError,
          );
        });
        importPhotosUseCase.markUploaded(albumId, photoId);
        queuePhotoPersist(albumId, photoId);
        scheduleAlbumPersist(albumId);
      })
      .catch(err => {
        if (isUploadQueueIdle(albumId)) {
          scheduleAlbumPersist(albumId);
        }
        throw err;
      })
      .finally(() => {
        inFlight.delete(photoId);
        trackActiveUpload(albumId, -1);
        processPending(albumId);
        scheduleLocalImportBatchCompleteCheck(albumId);
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

    let slotsUsed = getActiveUploadCount(albumId);
    let started = 0;

    while (slotsUsed < maxConcurrent) {
      const nextIndex = findNextPendingIndex(albumId, pendingPhotoIds, cursor);
      if (nextIndex < 0) {
        cursor = pendingPhotoIds.length;
        break;
      }

      cursor = nextIndex + 1;
      const photoId = pendingPhotoIds[nextIndex]!;

      uploadPhoto(albumId, photoId).catch(err => {
        const message =
          err instanceof Error && err.message ? err.message : undefined;
        failPhoto(albumId, photoId, message);
      });
      slotsUsed++;
      started++;
    }

    pendingCursorByAlbum.set(albumId, cursor);

    if (started === 0 && getActiveUploadCount(albumId) === 0) {
      const retryIndex = findNextPendingIndex(albumId, pendingPhotoIds, 0);
      if (retryIndex < 0) {
        return;
      }

      pendingCursorByAlbum.set(albumId, retryIndex);
      setTimeout(() => processPending(albumId), QUEUE_YIELD_MS);
    }
  }

  return {processPending, failPhoto};
}
