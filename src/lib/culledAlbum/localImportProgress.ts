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
  const batchIds = new Set(batchPhotoIds);
  const counts = createLocalImportBatchCounts(0);

  for (const photo of photos) {
    if (!batchIds.has(photo.photoId)) {
      continue;
    }

    counts.total++;
    switch (photo.status) {
      case 'pending':
        counts.pending++;
        break;
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
  const batchPhotos = getLocalImportBatchPhotos(photos, batchPhotoIds);
  if (batchPhotos.length === 0) {
    return false;
  }

  return batchPhotos.every(
    photo => photo.status === 'uploaded' || photo.status === 'failed',
  );
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
