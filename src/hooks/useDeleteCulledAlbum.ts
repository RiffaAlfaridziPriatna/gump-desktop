import {useCulledAlbumActions} from '@context/culledAlbum';
import {CulledAlbumListItem} from '@lib/culledAlbum/types';
import {captureAppEvent} from '@lib/observability/posthogClient';
import {useCallback} from 'react';

export function useDeleteCulledAlbum() {
  const {purgeAlbum} = useCulledAlbumActions();

  return useCallback(
    async (album: CulledAlbumListItem) => {
      await purgeAlbum(album.albumId);
      captureAppEvent('album_deleted', {
        albumId: album.albumId,
        photoCount: album.totalPhotos ?? 0,
        cullingCompleted: Boolean(album.cullingCompleted),
      });
    },
    [purgeAlbum],
  );
}
