import {syncPhotoFromStore} from '@/application/syncPhotoRepository';
import {
  getFileThumbnailDimensions,
  putCachedImageDimensions,
  type ImageDimensions,
} from '@lib/media/imageDimensions';
import {isUsableThumbnailUri} from '@lib/storage/localStorage';
import {photoKey, photoStateStore} from './photoStateStore';

const PERSIST_FLUSH_MS = 500;

type PendingDim = {
  albumId: string;
  photoId: string;
  dimensions: ImageDimensions;
};

const pendingByKey = new Map<string, PendingDim>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function applyPhotoStateDimensions(
  albumId: string,
  photoId: string,
  dimensions: ImageDimensions,
): boolean {
  const key = photoKey(albumId, photoId);
  let wrote = false;

  photoStateStore.setState(state => {
    const photo = state.photoState[key];
    if (!photo) {
      return;
    }
    if (getFileThumbnailDimensions(photo.file)) {
      return;
    }
    photo.file = {
      ...photo.file,
      thumbnailWidth: dimensions.width,
      thumbnailHeight: dimensions.height,
    };
    wrote = true;
  });

  return wrote;
}

function flushPendingDimensionPersists(): void {
  flushTimer = null;
  if (pendingByKey.size === 0) {
    return;
  }

  const batch = [...pendingByKey.values()];
  pendingByKey.clear();

  for (const entry of batch) {
    const wrote = applyPhotoStateDimensions(
      entry.albumId,
      entry.photoId,
      entry.dimensions,
    );
    if (wrote) {
      // No scheduleRenderSync — local thumbnail state + memory cache already
      // cover UI; avoid global cell fan-out during scroll.
      syncPhotoFromStore(entry.albumId, entry.photoId);
    }
  }
}

function scheduleDimensionPersistFlush(): void {
  if (flushTimer) {
    return;
  }
  flushTimer = setTimeout(flushPendingDimensionPersists, PERSIST_FLUSH_MS);
}

/**
 * Persist thumbnail dimensions without bumping global snapshotRevision.
 * Memory cache updates immediately; photo-state + disk sync are coalesced
 * (~500ms) so fast scroll does not saturate the bridge/DB queue.
 */
export function persistThumbnailDimensions(
  albumId: string,
  photoId: string,
  dimensions: ImageDimensions,
): void {
  if (dimensions.width <= 0 || dimensions.height <= 0) {
    return;
  }

  const key = photoKey(albumId, photoId);
  const photo = photoStateStore.getState().photoState[key];
  const thumbnailUri = photo?.file.thumbnailUri;

  if (thumbnailUri && isUsableThumbnailUri(thumbnailUri)) {
    putCachedImageDimensions(thumbnailUri, dimensions);
  }

  if (photo && getFileThumbnailDimensions(photo.file)) {
    return;
  }

  pendingByKey.set(key, {albumId, photoId, dimensions});
  scheduleDimensionPersistFlush();
}

/** Flush pending dimension persists (e.g. on scroll idle / unmount). */
export function flushPendingThumbnailDimensions(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushPendingDimensionPersists();
}
