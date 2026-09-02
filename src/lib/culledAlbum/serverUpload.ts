import {resolveUseCases} from '@di/useCases';
import {make} from '@di/tsyringe';
import {APIException, APIService} from '@services/api';
import {CulledAlbumPhoto} from './types';
import {getPhotoById, updatePhoto} from './store';

function getUploadSelectedPhotosUseCase() {
  return resolveUseCases().uploadSelectedPhotos;
}

function isRetryableServerError(err: unknown): boolean {
  return err instanceof APIException && err.statusCode >= 500;
}

async function uploadFile(
  photo: CulledAlbumPhoto,
  albumId: string,
  onProgress: (progress: number) => void,
): Promise<void> {
  const api = make(APIService);
  await api.media.upload({file: photo.file, albumId}, onProgress);
}

export async function uploadServerPhoto(
  albumId: string,
  photoId: string,
): Promise<void> {
  const photo = getPhotoById(albumId, photoId);
  if (!photo) {
    throw new Error('Photo not found');
  }

  updatePhoto(albumId, photoId, entry => {
    entry.serverUploadStatus = 'uploading';
    entry.serverUploadProgress = 0;
    entry.serverUploadError = undefined;
  });
  getUploadSelectedPhotosUseCase().startUpload(albumId, photoId);

  let lastProgressWriteAt = 0;
  const onProgress = (progress: number) => {
    getUploadSelectedPhotosUseCase().updateProgress(albumId, photoId, progress);
    const now = Date.now();
    if (now - lastProgressWriteAt < 250 && progress < 99) {
      return;
    }
    lastProgressWriteAt = now;
    updatePhoto(albumId, photoId, entry => {
      if (entry.serverUploadStatus === 'failed') {
        return;
      }
      entry.serverUploadProgress = Math.min(progress, 99);
      entry.serverUploadStatus = 'uploading';
    });
  };

  try {
    await uploadFile(photo, albumId, onProgress);
  } catch (err) {
    if (!isRetryableServerError(err)) {
      throw err;
    }

    updatePhoto(albumId, photoId, entry => {
      entry.serverUploadProgress = 0;
      entry.serverUploadStatus = 'uploading';
      entry.serverUploadError = undefined;
    });
    await uploadFile(photo, albumId, onProgress);
  }

  updatePhoto(albumId, photoId, entry => {
    entry.serverUploadProgress = 100;
    entry.serverUploadStatus = 'uploaded';
  });
  getUploadSelectedPhotosUseCase().markUploaded(albumId, photoId);
}
