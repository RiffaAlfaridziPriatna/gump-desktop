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

    let uploadingCount = 0;
    for (const photoId of batchPhotoIds) {
      if (getPhoto(albumId, photoId)?.serverUploadStatus === 'uploading') {
        uploadingCount++;
      }
    }

    for (const photoId of batchPhotoIds) {
      if (uploadingCount >= maxConcurrent) {
        break;
      }

      const photo = getPhoto(albumId, photoId);
      if (!photo || photo.serverUploadStatus !== 'pending') {
        continue;
      }

      uploadPhoto(albumId, photoId)
        .then(async () => {
          await checkServerUploadBatchComplete(albumId);
          processPending(albumId);
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
          processPending(albumId);
        });
      uploadingCount++;
    }
  }

  return {processPending, failPhoto};
}
