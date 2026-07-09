import {container} from '@di/container';
import {TOKENS} from '@di/tokens';
import {IPhotoRepository} from '@/domain/repositories/IPhotoRepository';
import {getPhotoById} from '@lib/culledAlbum/store';
import {legacyPhotoToDomain} from '@lib/culledAlbum/photoMapper';
import {
  runOrDeferHeavyWorkForNavigation,
  shouldDeferHeavyWorkForNavigation,
} from '@lib/navigation/uploadAwareNavigation';

const SYNC_DEBOUNCE_MS = 750;
const SYNC_BATCH_SIZE = 25;
const syncTimers = new Map<string, ReturnType<typeof setTimeout>>();

function savePhotoBatch(albumId: string, photoIds: string[]): void {
  const photoRepo = container.resolve<IPhotoRepository>(TOKENS.IPhotoRepository);
  const photos = photoIds
    .map(photoId => getPhotoById(albumId, photoId))
    .filter((photo): photo is NonNullable<typeof photo> => Boolean(photo))
    .map(photo => legacyPhotoToDomain(photo, albumId));

  if (photos.length > 0) {
    photoRepo.saveMany(photos);
  }
}

function scheduleNextChunk(work: () => void): void {
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => {
      setTimeout(work, 0);
    });
    return;
  }
  setTimeout(work, 0);
}

function syncPhotosFromStoreChunked(
  albumId: string,
  photoIds: string[],
  startIndex = 0,
): void {
  if (photoIds.length === 0) {
    return;
  }

  if (shouldDeferHeavyWorkForNavigation()) {
    runOrDeferHeavyWorkForNavigation(() =>
      syncPhotosFromStoreChunked(albumId, photoIds, startIndex),
    );
    return;
  }

  const batchIds = photoIds.slice(startIndex, startIndex + SYNC_BATCH_SIZE);
  if (batchIds.length === 0) {
    return;
  }

  savePhotoBatch(albumId, batchIds);

  const nextIndex = startIndex + SYNC_BATCH_SIZE;
  if (nextIndex < photoIds.length) {
    scheduleNextChunk(() =>
      syncPhotosFromStoreChunked(albumId, photoIds, nextIndex),
    );
  }
}

export function syncPhotoFromStoreNow(albumId: string, photoId: string): void {
  if (shouldDeferHeavyWorkForNavigation()) {
    runOrDeferHeavyWorkForNavigation(() =>
      syncPhotoFromStoreNow(albumId, photoId),
    );
    return;
  }

  const legacy = getPhotoById(albumId, photoId);
  if (!legacy) {
    return;
  }

  const domain = legacyPhotoToDomain(legacy, albumId);
  container.resolve<IPhotoRepository>(TOKENS.IPhotoRepository).save(domain);
}

export function syncPhotoFromStore(albumId: string, photoId: string): void {
  const key = `${albumId}:${photoId}`;
  const existing = syncTimers.get(key);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    syncTimers.delete(key);
    syncPhotoFromStoreNow(albumId, photoId);
  }, SYNC_DEBOUNCE_MS);

  syncTimers.set(key, timer);
}

export function syncPhotosFromStore(albumId: string, photoIds: string[]): void {
  if (photoIds.length === 0) {
    return;
  }

  if (shouldDeferHeavyWorkForNavigation()) {
    runOrDeferHeavyWorkForNavigation(() =>
      syncPhotosFromStore(albumId, photoIds),
    );
    return;
  }

  syncPhotosFromStoreChunked(albumId, photoIds);
}
