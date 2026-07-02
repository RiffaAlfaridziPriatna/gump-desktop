import {CulledAlbumPhoto} from './types';

export function getAnalysisBatchPhotos(
  photos: CulledAlbumPhoto[],
  batchPhotoIds: string[],
): CulledAlbumPhoto[] {
  const batchIds = new Set(batchPhotoIds);
  return photos.filter(photo => batchIds.has(photo.photoId));
}

export function isAnalysisBatchFinished(
  photos: CulledAlbumPhoto[],
  batchPhotoIds: string[],
): boolean {
  const batchPhotos = getAnalysisBatchPhotos(photos, batchPhotoIds);
  if (batchPhotos.length === 0) {
    return false;
  }

  return batchPhotos.every(
    photo =>
      photo.analysisStatus === 'analyzed' || photo.analysisStatus === 'failed',
  );
}
