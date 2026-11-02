import {resolveUseCases} from '@di/useCases';
import {make} from '@di/tsyringe';
import {getBakedUploadFile} from '@lib/look/uploadLookBake';
import {APIException, APIService} from '@services/api';
import type {FileAsset} from '@services/upload/types';
import {resolveUploadFileAsset} from './resolveUploadFileAsset';
import {CulledAlbumPhoto} from './types';
import {UploadSourceMissingError} from './formatUploadError';
import {getPhotoById, updatePhoto} from './store';

function getUploadSelectedPhotosUseCase() {
  return resolveUseCases().uploadSelectedPhotos;
}

function isRetryableServerError(err: unknown): boolean {
  return err instanceof APIException && err.statusCode >= 500;
}

function resolveUploadFile(
  albumId: string,
  photo: CulledAlbumPhoto,
): FileAsset {
  try {
    return resolveUploadFileAsset(
      photo,
      getBakedUploadFile(albumId, photo.photoId),
    );
  } catch (err) {
    throw new UploadSourceMissingError('Photo source is unavailable', {
      cause: err,
    });
  }
}

async function uploadFile(
  photo: CulledAlbumPhoto,
  albumId: string,
  onProgress: (progress: number) => void,
): Promise<void> {
  const api = make(APIService);
  await api.media.upload(
    {file: resolveUploadFile(albumId, photo), albumId},
    onProgress,
  );
}

function isFailed(albumId: string, photoId: string): boolean {
  return getPhotoById(albumId, photoId)?.serverUploadStatus === 'failed';
}

export async function uploadServerPhoto(
  albumId: string,
  photoId: string,
): Promise<void> {
  const photo = getPhotoById(albumId, photoId);
  if (!photo) {
    throw new UploadSourceMissingError('Photo not found');
  }

  updatePhoto(albumId, photoId, entry => {
    entry.serverUploadStatus = 'uploading';
    entry.serverUploadProgress = 0;
    entry.serverUploadError = undefined;
    entry.serverUploadCause = undefined;
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
    if (!isRetryableServerError(err) || isFailed(albumId, photoId)) {
      throw err;
    }

    updatePhoto(albumId, photoId, entry => {
      entry.serverUploadProgress = 0;
      entry.serverUploadStatus = 'uploading';
      entry.serverUploadError = undefined;
      entry.serverUploadCause = undefined;
    });
    await uploadFile(photo, albumId, onProgress);
  }

  // A stale attempt (after the queue timed out) must not overwrite a settled failure.
  if (isFailed(albumId, photoId)) {
    return;
  }
  updatePhoto(albumId, photoId, entry => {
    entry.serverUploadProgress = 100;
    entry.serverUploadStatus = 'uploaded';
  });
  getUploadSelectedPhotosUseCase().markUploaded(albumId, photoId);
}
