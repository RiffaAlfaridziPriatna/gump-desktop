import {useCulledAlbumActions} from '@context/culledAlbum';
import {CulledAlbum} from '@lib/culledAlbum/types';
import {useCallback} from 'react';

export function useDeleteCulledAlbum() {
  const {purgeAlbum} = useCulledAlbumActions();

  return useCallback(
    async (album: CulledAlbum) => {
      await purgeAlbum(album.albumId);
    },
    [purgeAlbum],
  );
}
