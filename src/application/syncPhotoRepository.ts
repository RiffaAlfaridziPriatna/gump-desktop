import {container} from '@di/container';
import {TOKENS} from '@di/tokens';
import {IPhotoRepository} from '@/domain/repositories/IPhotoRepository';
import {getPhotoById} from '@lib/culledAlbum/store';
import {legacyPhotoToDomain} from '@lib/culledAlbum/photoMapper';
import {
  runOrDeferHeavyWorkForNavigation,
  shouldDeferHeavyWorkForNavigation,
} from '@lib/navigation/uploadAwareNavigation';

const SYNC_DEBOUNCE_MS = 250;
const SYNC_BATCH_SIZE = 20;
const syncTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function savePhotoBatch(albumId: string, photoIds: string[]): Promise<void> {
  const photoRepo = container.resolve<IPhotoRepository>(TOKENS.IPhotoRepository);
  const photos = photoIds
    .map(photoId => getPhotoById(albumId, photoId))
    .filter((photo): photo is NonNullable<typeof photo> => Boolean(photo))
    .map(photo => legacyPhotoToDomain(photo, albumId));

  if (photos.length > 0) {
    await photoRepo.saveMany(photos);
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

async function syncPhotosFromStoreChunked(
  albumId: string,
  photoIds: string[],
  startIndex = 0,
): Promise<void> {
  if (photoIds.length === 0) {
    return;
  }

  if (shouldDeferHeavyWorkForNavigation()) {
    return new Promise<void>((resolve, reject) => {
      runOrDeferHeavyWorkForNavigation(() => {
        syncPhotosFromStoreChunked(albumId, photoIds, startIndex)
          .then(resolve)
          .catch(reject);
      });
    });
  }

  const batchIds = photoIds.slice(startIndex, startIndex + SYNC_BATCH_SIZE);
  if (batchIds.length === 0) {
    return;
  }

  await savePhotoBatch(albumId, batchIds);

  const nextIndex = startIndex + SYNC_BATCH_SIZE;
  if (nextIndex < photoIds.length) {
    await new Promise<void>((resolve, reject) => {
      scheduleNextChunk(() => {
        syncPhotosFromStoreChunked(albumId, photoIds, nextIndex)
          .then(resolve)
          .catch(reject);
      });
    });
  }
}

export async function syncPhotosFromStoreAwait(
  albumId: string,
  photoIds: string[],
): Promise<void> {
  if (photoIds.length === 0) {
    return;
  }

  await syncPhotosFromStoreChunked(albumId, photoIds);
}

export async function syncPhotoFromStoreNow(
  albumId: string,
  photoId: string,
): Promise<void> {
  if (shouldDeferHeavyWorkForNavigation()) {
    runOrDeferHeavyWorkForNavigation(() => {
      void syncPhotoFromStoreNow(albumId, photoId);
    });
    return;
  }

  const legacy = getPhotoById(albumId, photoId);
  if (!legacy) {
    return;
  }

  const domain = legacyPhotoToDomain(legacy, albumId);
  await container.resolve<IPhotoRepository>(TOKENS.IPhotoRepository).save(domain);
}

export function syncPhotoFromStore(albumId: string, photoId: string): void {
  const key = `${albumId}:${photoId}`;
  const existing = syncTimers.get(key);
  if (existing) {
    clearTimeout(existing);
  }

  const timer = setTimeout(() => {
    syncTimers.delete(key);
    void syncPhotoFromStoreNow(albumId, photoId);
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

  void syncPhotosFromStoreChunked(albumId, photoIds);
}
