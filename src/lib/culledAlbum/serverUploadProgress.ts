import {CulledAlbumPhoto} from './types';

export function getServerUploadBatchPhotos(
  photos: CulledAlbumPhoto[],
  batchPhotoIds: string[],
): CulledAlbumPhoto[] {
  const batchIds = new Set(batchPhotoIds);
  return photos.filter(photo => batchIds.has(photo.photoId));
}

function serverUploadItemProgress(photo: CulledAlbumPhoto): number {
  if (
    photo.serverUploadStatus === 'uploaded' ||
    photo.serverUploadStatus === 'failed'
  ) {
    return 1;
  }
  if (photo.serverUploadStatus === 'uploading') {
    return Math.max(0.05, photo.serverUploadProgress / 100);
  }
  return 0;
}

export function computeServerUploadBatchProgress(
  photos: CulledAlbumPhoto[],
  batchPhotoIds: string[],
): number {
  const batchPhotos = getServerUploadBatchPhotos(photos, batchPhotoIds);
  if (batchPhotos.length === 0) {
    return 0;
  }

  const total = batchPhotos.reduce(
    (sum, photo) => sum + serverUploadItemProgress(photo),
    0,
  );
  return total / batchPhotos.length;
}

export function isServerUploadBatchFinished(
  photos: CulledAlbumPhoto[],
  batchPhotoIds: string[],
): boolean {
  const batchPhotos = getServerUploadBatchPhotos(photos, batchPhotoIds);
  if (batchPhotos.length === 0) {
    return false;
  }

  return batchPhotos.every(
    photo =>
      photo.serverUploadStatus === 'uploaded' ||
      photo.serverUploadStatus === 'failed',
  );
}

export function isServerUploadBatchSuccessful(
  photos: CulledAlbumPhoto[],
  batchPhotoIds: string[],
): boolean {
  const batchPhotos = getServerUploadBatchPhotos(photos, batchPhotoIds);
  return (
    batchPhotos.length > 0 &&
    batchPhotos.every(photo => photo.serverUploadStatus === 'uploaded')
  );
}
