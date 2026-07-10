import {
  AnalysisBatchCounts,
  CulledAlbumPhoto,
} from './types';

export function createAnalysisBatchCounts(total: number): AnalysisBatchCounts {
  return {
    total,
    pending: total,
    analyzing: 0,
    analyzed: 0,
    failed: 0,
  };
}

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
  if (batchPhotoIds.length === 0) {
    return false;
  }

  const photosById = new Map(photos.map(photo => [photo.photoId, photo]));
  for (const photoId of batchPhotoIds) {
    const photo = photosById.get(photoId);
    if (
      !photo ||
      (photo.analysisStatus !== 'analyzed' && photo.analysisStatus !== 'failed')
    ) {
      return false;
    }
  }

  return true;
}

export function isAnalysisBatchFinishedByCounts(
  counts: AnalysisBatchCounts | undefined,
): boolean {
  if (!counts || counts.total === 0) {
    return false;
  }
  return counts.pending === 0 && counts.analyzing === 0;
}

export function computeAnalysisBatchCountsForIds(
  batchPhotoIds: string[],
  getPhoto: (photoId: string) => CulledAlbumPhoto | undefined,
): AnalysisBatchCounts {
  const counts: AnalysisBatchCounts = {
    total: batchPhotoIds.length,
    pending: 0,
    analyzing: 0,
    analyzed: 0,
    failed: 0,
  };

  for (const photoId of batchPhotoIds) {
    const photo = getPhoto(photoId);
    if (!photo || photo.analysisStatus === 'pending') {
      counts.pending++;
      continue;
    }

    switch (photo.analysisStatus) {
      case 'analyzing':
        counts.analyzing++;
        break;
      case 'analyzed':
        counts.analyzed++;
        break;
      case 'failed':
        counts.failed++;
        break;
      default:
        counts.pending++;
        break;
    }
  }

  return counts;
}
