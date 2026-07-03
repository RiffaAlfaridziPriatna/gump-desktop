import {useCulledAlbumActions} from '@context/culledAlbum';
import {CulledAlbumListItem} from '@lib/culledAlbum/types';
import {useCallback} from 'react';

export function useDeleteCulledAlbum() {
  const {purgeAlbum} = useCulledAlbumActions();

  return useCallback(
    async (album: CulledAlbumListItem) => {
      await purgeAlbum(album.albumId);
    },
    [purgeAlbum],
  );
}
