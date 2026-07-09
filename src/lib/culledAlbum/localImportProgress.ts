import {CulledAlbumPhoto, LocalImportBatchCounts} from './types';

export function createLocalImportBatchCounts(
  total: number,
): LocalImportBatchCounts {
  return {
    total,
    pending: total,
    uploading: 0,
    uploaded: 0,
    failed: 0,
  };
}

export function computeLocalImportBatchCounts(
  photos: CulledAlbumPhoto[],
  batchPhotoIds: string[],
): LocalImportBatchCounts {
  const photosById = new Map(photos.map(photo => [photo.photoId, photo]));
  return computeLocalImportBatchCountsForIds(batchPhotoIds, photoId =>
    photosById.get(photoId),
  );
}

export function countLocalImportBatchForAlbum(
  batchPhotoIds: string[],
  batchTotal: number,
  getPhoto: (photoId: string) => CulledAlbumPhoto | undefined,
): LocalImportBatchCounts {
  const counts: LocalImportBatchCounts = {
    total: batchTotal > 0 ? batchTotal : batchPhotoIds.length,
    pending: 0,
    uploading: 0,
    uploaded: 0,
    failed: 0,
  };

  for (const photoId of batchPhotoIds) {
    const photo = getPhoto(photoId);
    if (!photo || photo.status === 'pending') {
      counts.pending++;
      continue;
    }

    switch (photo.status) {
      case 'uploading':
        counts.uploading++;
        break;
      case 'uploaded':
        counts.uploaded++;
        break;
      case 'failed':
        counts.failed++;
        break;
    }
  }

  return counts;
}

export function computeLocalImportBatchCountsForIds(
  batchPhotoIds: string[],
  getPhoto: (photoId: string) => CulledAlbumPhoto | undefined,
): LocalImportBatchCounts {
  const counts: LocalImportBatchCounts = {
    total: batchPhotoIds.length,
    pending: 0,
    uploading: 0,
    uploaded: 0,
    failed: 0,
  };

  for (const photoId of batchPhotoIds) {
    const photo = getPhoto(photoId);
    if (!photo || photo.status === 'pending') {
      counts.pending++;
      continue;
    }

    switch (photo.status) {
      case 'uploading':
        counts.uploading++;
        break;
      case 'uploaded':
        counts.uploaded++;
        break;
      case 'failed':
        counts.failed++;
        break;
    }
  }

  return counts;
}

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
  const photosById = new Map(photos.map(photo => [photo.photoId, photo]));
  return isLocalImportBatchFinishedForIds(batchPhotoIds, photoId =>
    photosById.get(photoId),
  );
}

export function isLocalImportBatchFinishedForIds(
  batchPhotoIds: string[],
  getPhoto: (photoId: string) => CulledAlbumPhoto | undefined,
): boolean {
  if (batchPhotoIds.length === 0) {
    return false;
  }

  for (const photoId of batchPhotoIds) {
    const photo = getPhoto(photoId);
    if (
      !photo ||
      (photo.status !== 'uploaded' && photo.status !== 'failed')
    ) {
      return false;
    }
  }

  return true;
}

export function computeLocalImportBatchProgress(
  counts: LocalImportBatchCounts,
): number {
  if (counts.total === 0) {
    return 0;
  }

  const remaining = counts.pending + counts.uploading;
  return 1 - remaining / counts.total;
}
