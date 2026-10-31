import {useMemo} from 'react';
import type {CulledAlbumPhoto} from '@lib/culledAlbum/types';

// Every picked photo of the album, independent of grid filters. Same criteria
// as the sidebar "Picked for Upload" count (analyzed && selected).
export function usePickedPhotos(albumPhotos: CulledAlbumPhoto[]) {
  return useMemo(
    () =>
      albumPhotos.filter(
        photo => photo.selected && photo.analysisStatus === 'analyzed',
      ),
    [albumPhotos],
  );
}
