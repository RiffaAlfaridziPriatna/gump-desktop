import {yieldToMain} from '@lib/async/yieldToMain';
import {culledAlbumStore, ensureAlbumLoaded} from '@lib/culledAlbum/store';
import {hydratePhotos, ensurePhotoOrder} from '@lib/culledAlbum/photoLoader';
import {cullingEngine} from '@lib/culling/cullingEngine';
import {photoStateStore} from '@lib/culledAlbum/photoStateStore';
import {useCulledAlbumPhotosState} from '@context/culledAlbum';
import {FileAsset} from '@services/upload/types';
import {useCallback, useEffect, useMemo, useState} from 'react';

const HYDRATE_BATCH_SIZE = 48;

type Options = {
  skipInitialLoad?: boolean;
};

function hasCachedAlbumPhotos(albumId: string): boolean {
  const order = photoStateStore.getState().photoOrder[albumId];
  if (order && order.length > 0) {
    return true;
  }
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
      const photoIds = ensurePhotoOrder(albumId);
      for (let index = 0; index < photoIds.length; index += HYDRATE_BATCH_SIZE) {
        hydratePhotos(albumId, photoIds.slice(index, index + HYDRATE_BATCH_SIZE));
        if (index + HYDRATE_BATCH_SIZE < photoIds.length) {
          await yieldToMain();
        }
      }

      const album = culledAlbumStore.getState().albums[albumId];
      if (album?.cullingCompleted) {
        void cullingEngine.refreshDuplicateFlags(albumId);
      }
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
