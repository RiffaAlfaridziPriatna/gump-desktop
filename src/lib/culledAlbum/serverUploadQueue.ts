import {
  checkServerUploadBatchComplete,
  getAlbum,
  persistAlbum,
  updatePhoto,
} from './store';
import {formatUploadError} from './formatUploadError';
import {CulledAlbumPhoto} from './types';

export type ServerUploadQueueDeps = {
  maxConcurrent: number;
  getPhoto: (
    albumId: string,
    photoId: string,
  ) => CulledAlbumPhoto | undefined;
  updatePhoto: (
    albumId: string,
    photoId: string,
    updater: (photo: CulledAlbumPhoto) => void,
  ) => boolean;
  persistAlbum: (albumId: string) => Promise<void>;
  uploadPhoto: (albumId: string, photoId: string) => Promise<void>;
};

export function createServerUploadQueue(deps: ServerUploadQueueDeps) {
  const {maxConcurrent, getPhoto, updatePhoto, persistAlbum, uploadPhoto} =
    deps;
  const activeUploadCounts = new Map<string, number>();

  function resetActiveUploadCount(albumId: string): void {
    activeUploadCounts.set(albumId, 0);
  }

  function failPhoto(albumId: string, photoId: string, error?: string): void {
    updatePhoto(albumId, photoId, photo => {
      if (photo.serverUploadStatus !== 'uploaded') {
        photo.serverUploadStatus = 'failed';
        photo.serverUploadError = error;
      }
    });
  }

  function processPending(albumId: string): void {
    const batchPhotoIds = getAlbum(albumId)?.uploadBatchPhotoIds ?? [];
    if (batchPhotoIds.length === 0) {
      return;
    }

    let uploadingCount = activeUploadCounts.get(albumId) ?? 0;

    for (const photoId of batchPhotoIds) {
      if (uploadingCount >= maxConcurrent) {
        break;
      }

      const photo = getPhoto(albumId, photoId);
      if (!photo || photo.serverUploadStatus !== 'pending') {
        continue;
      }

      updatePhoto(albumId, photoId, entry => {
        entry.serverUploadStatus = 'uploading';
        entry.serverUploadProgress = 0;
        entry.serverUploadError = undefined;
      });

      uploadingCount++;
      activeUploadCounts.set(albumId, uploadingCount);

      void uploadPhoto(albumId, photoId)
        .then(async () => {
          await checkServerUploadBatchComplete(albumId);
        })
        .catch(err => {
          console.error('[serverUploadQueue] Upload failed', {
            albumId,
            photoId,
            filename: getPhoto(albumId, photoId)?.file.name,
            err,
          });
          failPhoto(albumId, photoId, formatUploadError(err));
          void persistAlbum(albumId);
          void checkServerUploadBatchComplete(albumId);
        })
        .finally(() => {
          const current = activeUploadCounts.get(albumId) ?? 1;
          activeUploadCounts.set(albumId, Math.max(0, current - 1));
          processPending(albumId);
        });
    }
  }

  return {processPending, failPhoto, resetActiveUploadCount};
}
