import {UploadSelectedPhotosUseCase} from '@/application/useCases/UploadSelectedPhotosUseCase';
import {
  runOrDeferHeavyWorkForNavigation,
  shouldYieldUploadQueueForNavigation,
} from '@lib/navigation/uploadAwareNavigation';
import {
  checkServerUploadBatchComplete,
  getAlbum,
  type UpdatePhotoOptions,
} from './store';
import {formatUploadError} from './formatUploadError';
import {CulledAlbumPhoto} from './types';

const QUEUE_YIELD_MS = 16;
const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const PERSIST_BATCH_SIZE = 20;

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

export type ServerUploadQueueDeps = {
  maxConcurrent: number;
  uploadSelectedPhotosUseCase: UploadSelectedPhotosUseCase;
  getPhoto: (
    albumId: string,
    photoId: string,
  ) => CulledAlbumPhoto | undefined;
  updatePhoto: (
    albumId: string,
    photoId: string,
    updater: (photo: CulledAlbumPhoto) => void,
    options?: UpdatePhotoOptions,
  ) => boolean;
  persistAlbum: (albumId: string) => Promise<void>;
  uploadPhoto: (albumId: string, photoId: string) => Promise<void>;
};

export function createServerUploadQueue(deps: ServerUploadQueueDeps) {
  const {
    maxConcurrent,
    uploadSelectedPhotosUseCase,
    getPhoto,
    updatePhoto,
    persistAlbum,
    uploadPhoto,
  } = deps;

  const activeUploadsByAlbum = new Map<string, number>();
  const inFlightPhotoIdsByAlbum = new Map<string, Set<string>>();
  const settledPhotoIdsByAlbum = new Map<string, Set<string>>();
  const pendingCursorByAlbum = new Map<string, number>();
  const batchSignatureByAlbum = new Map<string, string>();
  const completedSincePersistByAlbum = new Map<string, number>();

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

  function resetActiveUploadCount(albumId: string): void {
    activeUploadsByAlbum.delete(albumId);
    inFlightPhotoIdsByAlbum.delete(albumId);
    settledPhotoIdsByAlbum.delete(albumId);
    pendingCursorByAlbum.delete(albumId);
    batchSignatureByAlbum.delete(albumId);
    completedSincePersistByAlbum.delete(albumId);
  }

  function getBatchSignature(albumId: string): string {
    const ids = getAlbum(albumId)?.uploadBatchPhotoIds ?? [];
    if (ids.length === 0) {
      return '';
    }
    return `${ids.length}:${ids[0]}:${ids[ids.length - 1]}`;
  }

  function getPendingPhotoIds(albumId: string): string[] {
    return getAlbum(albumId)?.uploadBatchPhotoIds ?? [];
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
          photo.serverUploadStatus === 'uploaded' ||
          photo.serverUploadStatus === 'failed'
        ) {
          settled.add(photoId);
          continue;
        }
        if (
          photo.serverUploadStatus === 'pending' ||
          photo.serverUploadStatus === 'uploading'
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
    const completed = (completedSincePersistByAlbum.get(albumId) ?? 0) + 1;
    completedSincePersistByAlbum.set(albumId, completed);
    if (completed < PERSIST_BATCH_SIZE) {
      return;
    }
    completedSincePersistByAlbum.set(albumId, 0);
    runOrDeferHeavyWorkForNavigation(() => {
      persistAlbum(albumId).catch(() => undefined);
    });
  }

  function failPhoto(albumId: string, photoId: string, error?: string): void {
    const photo = getPhoto(albumId, photoId);
    if (!photo || photo.serverUploadStatus === 'uploaded') {
      return;
    }

    getInFlightPhotoIds(albumId).delete(photoId);
    getSettledPhotoIds(albumId).add(photoId);
    updatePhoto(
      albumId,
      photoId,
      entry => {
        if (entry.serverUploadStatus !== 'uploaded') {
          entry.serverUploadStatus = 'failed';
          entry.serverUploadError = error;
        }
      },
      {recomputeTotals: false},
    );
    uploadSelectedPhotosUseCase.markFailed(
      albumId,
      photoId,
      error ?? 'Upload failed',
    );
    schedulePersist(albumId);
  }

  function startUpload(albumId: string, photoId: string): Promise<void> {
    const inFlight = getInFlightPhotoIds(albumId);
    inFlight.add(photoId);
    trackActiveUpload(albumId, 1);

    updatePhoto(
      albumId,
      photoId,
      entry => {
        entry.serverUploadStatus = 'uploading';
        entry.serverUploadProgress = 0;
        entry.serverUploadError = undefined;
      },
      {recomputeTotals: false},
    );
    uploadSelectedPhotosUseCase.startUpload(albumId, photoId);

    return withTimeout(
      uploadPhoto(albumId, photoId),
      UPLOAD_TIMEOUT_MS,
      'Server photo upload',
    )
      .then(() => {
        getSettledPhotoIds(albumId).add(photoId);
        schedulePersist(albumId);
      })
      .catch(err => {
        throw err;
      })
      .finally(() => {
        inFlight.delete(photoId);
        trackActiveUpload(albumId, -1);
        processPending(albumId);
        void checkServerUploadBatchComplete(albumId);
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

      startUpload(albumId, photoId).catch(err => {
        const errorMessage = formatUploadError(err) ?? 'Upload failed';
        console.error('[serverUploadQueue] Upload failed', {
          albumId,
          photoId,
          filename: getPhoto(albumId, photoId)?.file.name,
          error: errorMessage,
        });
        failPhoto(albumId, photoId, errorMessage);
      });
      slotsUsed++;
      started++;
    }

    pendingCursorByAlbum.set(albumId, cursor);

    if (started === 0 && getActiveUploadCount(albumId) === 0) {
      const retryIndex = findNextPendingIndex(albumId, pendingPhotoIds, 0);
      if (retryIndex < 0) {
        void checkServerUploadBatchComplete(albumId);
        return;
      }

      pendingCursorByAlbum.set(albumId, retryIndex);
      setTimeout(() => processPending(albumId), QUEUE_YIELD_MS);
    }
  }

  return {processPending, failPhoto, resetActiveUploadCount};
}
