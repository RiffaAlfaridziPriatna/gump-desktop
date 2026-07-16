import {yieldToMain} from '@lib/async/yieldToMain';
import {culledAlbumStore, ensureAlbumLoaded} from '@lib/culledAlbum/store';
import {
  alignPhotoOrderByFilename,
  hydratePhotos,
} from '@lib/culledAlbum/photoLoader';
import {photoKey, photoStateStore} from '@lib/culledAlbum/photoStateStore';
import {
  scheduleResolveExistingThumbnails,
} from '@lib/culledAlbum/thumbnailBackfill';
import {useCulledAlbumPhotosState} from '@context/culledAlbum';
import {FileAsset} from '@services/upload/types';
import {useCallback, useEffect, useMemo, useState} from 'react';

const HYDRATE_BATCH_SIZE = 48;
const FIRST_PAINT_THUMBNAIL_COUNT = 12;

type Options = {
  skipInitialLoad?: boolean;
};

function hasCachedAlbumPhotos(albumId: string): boolean {
  const order = photoStateStore.getState().photoOrder[albumId];
  if (order && order.length > 0) {
    const firstPhotoKey = photoKey(albumId, order[0]!);
    if (photoStateStore.getState().photoState[firstPhotoKey]) {
      return true;
    }
  }
  const album = culledAlbumStore.getState().albums[albumId];
  return Boolean(
    album &&
      album.photos.some(
        photo => photo.status === 'uploaded' && Boolean(photo.file.uri),
      ),
  );
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
      const photoIds = alignPhotoOrderByFilename(albumId);

      const firstPaintIds = photoIds.slice(0, FIRST_PAINT_THUMBNAIL_COUNT);
      if (firstPaintIds.length > 0) {
        hydratePhotos(albumId, firstPaintIds);
        scheduleResolveExistingThumbnails(albumId, firstPaintIds);
      }

      for (let index = 0; index < photoIds.length; index += HYDRATE_BATCH_SIZE) {
        const batchIds = photoIds.slice(index, index + HYDRATE_BATCH_SIZE);
        hydratePhotos(albumId, batchIds);
        const remainingForThumbs =
          index === 0 ? batchIds.slice(firstPaintIds.length) : batchIds;
        if (remainingForThumbs.length > 0) {
          scheduleResolveExistingThumbnails(albumId, remainingForThumbs);
        }
        if (index + HYDRATE_BATCH_SIZE < photoIds.length) {
          await yieldToMain();
        }
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
