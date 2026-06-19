import {
  checkServerUploadBatchComplete,
  getAlbum,
  persistAlbum,
  updatePhoto,
} from './store';
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
        if (error) {
          photo.serverUploadError = error;
        }
      }
    });
  }

  function getBatchPhotoIds(albumId: string): string[] {
    return getAlbum(albumId)?.uploadBatchPhotoIds ?? [];
  }

  function processPending(albumId: string): void {
    const batchPhotoIds = new Set(getBatchPhotoIds(albumId));
    if (batchPhotoIds.size === 0) {
      return;
    }

    let uploadingCount = 0;
    for (const photoId of batchPhotoIds) {
      const photo = getPhoto(albumId, photoId);
      if (photo?.serverUploadStatus === 'uploading') {
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
          const message =
            err instanceof Error && err.message ? err.message : undefined;
          failPhoto(albumId, photoId, message);
          void persistAlbum(albumId);
          processPending(albumId);
        });
      uploadingCount++;
    }
  }

  return {processPending, failPhoto};
}

export async function stubServerUploadPhoto(
  albumId: string,
  photoId: string,
): Promise<void> {
  updatePhoto(albumId, photoId, photo => {
    photo.serverUploadStatus = 'uploading';
    photo.serverUploadError = undefined;
  });
  // Backend S3 upload will replace this stub.
  updatePhoto(albumId, photoId, photo => {
    photo.serverUploadStatus = 'uploaded';
  });
  await persistAlbum(albumId);
}
