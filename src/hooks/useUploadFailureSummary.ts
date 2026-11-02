import {useCulledAlbumServerUploadBatch} from '@context/culledAlbumHooks';
import type {CulledAlbumPhoto} from '@lib/culledAlbum/types';
import {UPLOAD_FAILURE_GROUP} from '@lib/culledAlbum/uploadPreflight';
import {useMemo} from 'react';

export type UploadFailureSummary = {
  total: number;
  uploaded: number;
  /** Failed photos a plain retry re-queues. */
  retryable: number;
  /** Failed photos blocked by the cloud storage limit. */
  quota: number;
  /** Failed photos that are never retried. */
  final: number;
  /** Bytes a retry of retryable and quota photos would upload. */
  retryBytes: number;
};

export function summarizeUploadFailures(
  photos: CulledAlbumPhoto[],
): UploadFailureSummary {
  const summary: UploadFailureSummary = {
    total: photos.length,
    uploaded: 0,
    retryable: 0,
    quota: 0,
    final: 0,
    retryBytes: 0,
  };
  for (const photo of photos) {
    if (photo.serverUploadStatus === 'uploaded') {
      summary.uploaded += 1;
    } else if (photo.serverUploadStatus === 'failed') {
      const group = UPLOAD_FAILURE_GROUP[photo.serverUploadCause ?? 'unknown'];
      summary[group] += 1;
      if (group !== 'final') {
        summary.retryBytes += photo.file.size ?? 0;
      }
    }
  }
  return summary;
}

export function useUploadFailureSummary(albumId: string): UploadFailureSummary {
  const {photos} = useCulledAlbumServerUploadBatch(albumId);
  return useMemo(() => summarizeUploadFailures(photos), [photos]);
}
