import {captureAppEvent} from '@lib/observability/posthogClient';
import {reportError} from '@lib/observability/reportError';
import type {CulledAlbumPhoto} from './types';
import {UPLOAD_FAILURE_GROUP, type UploadFailureCause} from './uploadPreflight';

export type RetryablePhoto = {photoId: string; cause: UploadFailureCause};

type PhotoLookup = (
  albumId: string,
  photoId: string,
) => CulledAlbumPhoto | undefined | null;

export function selectRetryablePhotos(
  albumId: string,
  batchIds: string[],
  getPhoto: PhotoLookup,
  options: {includeQuota: boolean},
): RetryablePhoto[] {
  const inFlight = batchIds.some(photoId => {
    const status = getPhoto(albumId, photoId)?.serverUploadStatus;
    return status === 'pending' || status === 'uploading';
  });
  if (inFlight) {
    return [];
  }
  const retried: RetryablePhoto[] = [];
  for (const photoId of batchIds) {
    const photo = getPhoto(albumId, photoId);
    if (photo?.serverUploadStatus !== 'failed') {
      continue;
    }
    const cause = photo.serverUploadCause ?? 'unknown';
    const group = UPLOAD_FAILURE_GROUP[cause];
    if (group === 'retryable' || (group === 'quota' && options.includeQuota)) {
      retried.push({photoId, cause});
    }
  }
  return retried;
}

export function captureServerUploadRetried(
  albumId: string,
  retried: RetryablePhoto[],
  options: {includeQuota: boolean},
): void {
  const causeCounts: Record<string, number> = {};
  for (const {cause} of retried) {
    causeCounts[`cause_${cause}`] = (causeCounts[`cause_${cause}`] ?? 0) + 1;
  }
  captureAppEvent('server_upload_retried', {
    albumId,
    retryCount: retried.length,
    includeQuota: options.includeQuota,
    ...causeCounts,
  });
}

export function selectPendingLookBakeIds(
  albumId: string,
  batchIds: string[],
  getPhoto: PhotoLookup,
): string[] {
  const pendingIds = batchIds.filter(
    photoId => getPhoto(albumId, photoId)?.serverUploadStatus === 'pending',
  );
  if (pendingIds.length === 0) {
    reportError(new Error('No pending photos to retry look bake'), {
      source: 'culled_album_provider',
      operation: 'retryUploadLookBake',
      albumId,
    });
  }
  return pendingIds;
}
