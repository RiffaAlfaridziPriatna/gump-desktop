import {hydratePhotos, getPhotoIdsForAlbum} from '@lib/culledAlbum/photoLoader';
import {useEffect} from 'react';

const DEFAULT_PADDING = 3;
const HYDRATE_DEBOUNCE_MS = 200;

const hydrateTimers = new Map<string, ReturnType<typeof setTimeout>>();
const lastHydrateKeyByAlbum = new Map<string, string>();

/**
 * Hydrate by explicit photo ids (filtered grid order). Prefer this over
 * index-based hydrate when the visible list is not full-album order.
 */
export function scheduleHydratePhotoIds(
  albumId: string,
  photoIds: string[],
): void {
  if (photoIds.length === 0) {
    return;
  }

  const key = `${photoIds[0]}:${photoIds[photoIds.length - 1]}:${photoIds.length}`;
  if (lastHydrateKeyByAlbum.get(albumId) === key) {
    return;
  }

  const existingTimer = hydrateTimers.get(albumId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  hydrateTimers.set(
    albumId,
    setTimeout(() => {
      hydrateTimers.delete(albumId);
      lastHydrateKeyByAlbum.set(albumId, key);
      hydratePhotos(albumId, photoIds);
    }, HYDRATE_DEBOUNCE_MS),
  );
}

/** @deprecated Prefer scheduleHydratePhotoIds when the list is filtered. */
export function scheduleHydrateVisiblePhotos(
  albumId: string,
  visibleIndices: number[],
  padding: number = DEFAULT_PADDING,
): void {
  if (visibleIndices.length === 0) {
    return;
  }

  const photoIds = getPhotoIdsForAlbum(albumId);
  if (photoIds.length === 0) {
    return;
  }

  const minIndex = Math.min(...visibleIndices);
  const maxIndex = Math.max(...visibleIndices);
  const start = Math.max(0, minIndex - padding);
  const end = Math.min(photoIds.length, maxIndex + padding + 1);
  scheduleHydratePhotoIds(albumId, photoIds.slice(start, end));
}

export function useVisiblePhotos(
  albumId: string | null,
  visibleIndices: number[],
  padding: number = DEFAULT_PADDING,
): void {
  useEffect(() => {
    if (!albumId || visibleIndices.length === 0) {
      return;
    }

    scheduleHydrateVisiblePhotos(albumId, visibleIndices, padding);
  }, [albumId, padding, visibleIndices]);
}
