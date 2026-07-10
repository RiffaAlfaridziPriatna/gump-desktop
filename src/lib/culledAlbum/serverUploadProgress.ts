import {CulledAlbumPhoto} from './types';

export type ServerUploadBatchCounts = {
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
};

export function countServerUploadBatchItems(
  photos: CulledAlbumPhoto[],
  batchPhotoIds: string[],
): ServerUploadBatchCounts {
  const counts: ServerUploadBatchCounts = {
    pending: 0,
    inProgress: 0,
    completed: 0,
    failed: 0,
  };
  const batchPhotos = getServerUploadBatchPhotos(photos, batchPhotoIds);

  for (const photo of batchPhotos) {
    if (photo.serverUploadStatus === 'pending') {
      counts.pending++;
    } else if (photo.serverUploadStatus === 'uploading') {
      counts.inProgress++;
    } else if (photo.serverUploadStatus === 'uploaded') {
      counts.completed++;
    } else if (photo.serverUploadStatus === 'failed') {
      counts.failed++;
    }
  }

  return counts;
}

export function getServerUploadBatchPhotos(
  photos: CulledAlbumPhoto[],
  batchPhotoIds: string[],
): CulledAlbumPhoto[] {
  const batchIds = new Set(batchPhotoIds);
  return photos.filter(photo => batchIds.has(photo.photoId));
}

function photoUploadProgress(photo: CulledAlbumPhoto): number {
  if (
    photo.serverUploadStatus === 'uploaded' ||
    photo.serverUploadStatus === 'failed'
  ) {
    return 1;
  }
  if (photo.serverUploadStatus === 'uploading') {
    return photo.serverUploadProgress / 100;
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

  let totalBytes = 0;
  let uploadedBytes = 0;

  for (const photo of batchPhotos) {
    const size = photo.file.size;
    if (size > 0) {
      totalBytes += size;
      uploadedBytes += size * photoUploadProgress(photo);
      continue;
    }

    totalBytes += 1;
    uploadedBytes += photoUploadProgress(photo);
  }

  return totalBytes === 0 ? 0 : uploadedBytes / totalBytes;
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
