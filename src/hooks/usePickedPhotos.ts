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

// True when a picked photo is not in the current grid, i.e. upload reaches
// beyond what the user can see.
export function hasPickedOutsideView(
  picked: CulledAlbumPhoto[],
  visible: {photoId: string}[],
) {
  const visibleIds = new Set(visible.map(photo => photo.photoId));
  return picked.some(photo => !visibleIds.has(photo.photoId));
}

export function usePickedPhotos(albumPhotos: CulledAlbumPhoto[]) {
  return useMemo(() => derivePickedSets(albumPhotos), [albumPhotos]);
}
