import {useMemo} from 'react';
import type {CulledAlbumPhoto} from '@lib/culledAlbum/types';

// Picked = selected, local import finished, analyzed: the photos the sidebar
// counts, and the only ones upload, export and Edit Photos may act on.
// Pending = picked photos not yet on the server (upload eligibility).
export function derivePickedSets(albumPhotos: CulledAlbumPhoto[]) {
  const picked = albumPhotos.filter(
    photo =>
      photo.selected &&
      photo.status === 'uploaded' &&
      photo.analysisStatus === 'analyzed',
  );
  const pending = picked.filter(
    photo => photo.serverUploadStatus !== 'uploaded',
  );
  return {picked, pending};
}

export function usePickedPhotos(albumPhotos: CulledAlbumPhoto[]) {
  return useMemo(() => derivePickedSets(albumPhotos), [albumPhotos]);
}
