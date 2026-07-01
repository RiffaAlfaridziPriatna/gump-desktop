import {CulledAlbumPhoto} from './types';

export function getLocalImportBatchPhotos(
  photos: CulledAlbumPhoto[],
  batchPhotoIds: string[],
): CulledAlbumPhoto[] {
  const batchIds = new Set(batchPhotoIds);
  return photos.filter(photo => batchIds.has(photo.photoId));
}

export function isLocalImportBatchFinished(
  photos: CulledAlbumPhoto[],
  batchPhotoIds: string[],
): boolean {
  const batchPhotos = getLocalImportBatchPhotos(photos, batchPhotoIds);
  if (batchPhotos.length === 0) {
    return false;
  }

  return batchPhotos.every(
    photo => photo.status === 'uploaded' || photo.status === 'failed',
  );
}
