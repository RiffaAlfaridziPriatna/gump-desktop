import {getPhotosByAlbum, toFileAsset} from '@lib/culledAlbumLocal';
import {FileAsset} from '@services/upload/types';
import {useCallback, useEffect, useState} from 'react';

export function useCulledAlbumPhotos(albumId: string) {
  const [photos, setPhotos] = useState<FileAsset[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadPhotos = useCallback(async () => {
    setLoadError(null);
    try {
      const records = await getPhotosByAlbum(albumId);
      setPhotos(records.map(toFileAsset));
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Failed to load local photos',
      );
    } finally {
      setLoadingPhotos(false);
    }
  }, [albumId]);

  useEffect(() => {
    setLoadingPhotos(true);
    loadPhotos();
  }, [loadPhotos]);

  return {
    photos,
    loadingPhotos,
    loadError,
    reloadPhotos: loadPhotos,
  };
}
