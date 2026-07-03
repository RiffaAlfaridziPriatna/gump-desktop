import {culledAlbumStore, ensureAlbumLoaded} from '@lib/culledAlbum/store';
import {useCulledAlbumPhotosState} from '@context/culledAlbum';
import {FileAsset} from '@services/upload/types';
import {useCallback, useEffect, useMemo, useState} from 'react';

type Options = {
  skipInitialLoad?: boolean;
};

function hasCachedAlbumPhotos(albumId: string): boolean {
  const album = culledAlbumStore.getState().albums[albumId];
  return Boolean(album && album.photos.length > 0);
}

export function useCulledAlbumPhotos(albumId: string, options?: Options) {
  const photos = useCulledAlbumPhotosState(albumId);
  const [loadingPhotos, setLoadingPhotos] = useState(
    () => !options?.skipInitialLoad && !hasCachedAlbumPhotos(albumId),
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadPhotos = useCallback(async () => {
    setLoadError(null);
    try {
      await ensureAlbumLoaded(albumId);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Failed to load local photos',
      );
    }
  }, [albumId]);

  useEffect(() => {
    if (options?.skipInitialLoad) {
      setLoadingPhotos(false);
      return;
    }

    const cached = hasCachedAlbumPhotos(albumId);
    if (!cached) {
      setLoadingPhotos(true);
    }

    let cancelled = false;

    loadPhotos().finally(() => {
      if (!cancelled) {
        setLoadingPhotos(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [albumId, loadPhotos, options?.skipInitialLoad]);

  const fileAssets: FileAsset[] = useMemo(
    () =>
      photos
        .filter(photo => photo.status === 'uploaded')
        .map(photo => photo.file),
    [photos],
  );

  return {
    photos: fileAssets,
    loadingPhotos,
    loadError,
    reloadPhotos: loadPhotos,
  };
}
