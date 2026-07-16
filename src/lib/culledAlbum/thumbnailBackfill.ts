import {yieldToMain} from '@lib/async/yieldToMain';
import {syncPhotoFromStore} from '@/application/syncPhotoRepository';
import {
  getPhotoIdsForAlbum,
  hydratePhotos,
} from '@lib/culledAlbum/photoLoader';
import {
  bumpPhotoGridRevision,
  photoKey,
  photoStateStore,
} from '@lib/culledAlbum/photoStateStore';
import {getPhotoById} from '@lib/culledAlbum/store';
import {shouldDeferHeavyWorkForNavigation} from '@lib/navigation/uploadAwareNavigation';
import {ensureThumbnail, isUsableThumbnailUri} from '@lib/storage/localStorage';

const BATCH_SIZE = 8;
const EXISTING_THUMB_CONCURRENCY = 12;
const GENERATE_CONCURRENCY = 8;
const REVISION_BUMP_DELAY_MS = 50;
const FULL_ALBUM_BACKFILL_DELAY_MS = 400;
const inFlightAlbumPhotoIds = new Set<string>();
const runningAlbums = new Set<string>();
const pendingPhotoIdsByAlbum = new Map<string, Set<string>>();
const existingThumbInFlight = new Set<string>();
const pendingRevisionAlbums = new Set<string>();
const deferredFullAlbumTimers = new Map<string, ReturnType<typeof setTimeout>>();
let revisionBumpTimer: ReturnType<typeof setTimeout> | null = null;
let resolveExistingQueue: Promise<void> = Promise.resolve();

function scheduleBumpPhotoGridRevision(albumId: string): void {
  pendingRevisionAlbums.add(albumId);
  if (revisionBumpTimer) {
    return;
  }

  revisionBumpTimer = setTimeout(() => {
    revisionBumpTimer = null;
    const albumIds = [...pendingRevisionAlbums];
    pendingRevisionAlbums.clear();
    for (const id of albumIds) {
      bumpPhotoGridRevision(id);
    }
  }, REVISION_BUMP_DELAY_MS);
}

function flushPendingPhotoGridRevisions(): void {
  if (revisionBumpTimer) {
    clearTimeout(revisionBumpTimer);
    revisionBumpTimer = null;
  }
  const albumIds = [...pendingRevisionAlbums];
  pendingRevisionAlbums.clear();
  for (const id of albumIds) {
    bumpPhotoGridRevision(id);
  }
}

function photoScheduleKey(albumId: string, photoId: string): string {
  return `${albumId}:${photoId}`;
}

function enqueuePending(albumId: string, photoIds: string[]): void {
  if (photoIds.length === 0) {
    return;
  }
  const pending = pendingPhotoIdsByAlbum.get(albumId) ?? new Set<string>();
  for (const photoId of photoIds) {
    pending.add(photoId);
  }
  pendingPhotoIdsByAlbum.set(albumId, pending);
}

function deferRemaining(albumId: string, photoIds: string[]): void {
  for (const photoId of photoIds) {
    inFlightAlbumPhotoIds.delete(photoScheduleKey(albumId, photoId));
  }
  enqueuePending(albumId, photoIds);
}

function applyThumbnailUri(
  albumId: string,
  photoId: string,
  thumbnailUri: string,
): boolean {
  const key = photoKey(albumId, photoId);
  let applied = false;

  photoStateStore.setState(state => {
    const photo = state.photoState[key];
    if (!photo || photo.file.thumbnailUri === thumbnailUri) {
      return;
    }
    photo.file = {...photo.file, thumbnailUri};
    applied = true;
  });

  if (applied) {
    scheduleBumpPhotoGridRevision(albumId);
    syncPhotoFromStore(albumId, photoId);
  }

  return applied;
}

async function ensureThumbnailsForPhotoIds(
  albumId: string,
  photoIds: string[],
  options?: {clearInFlight?: boolean},
): Promise<void> {
  for (let index = 0; index < photoIds.length; index += GENERATE_CONCURRENCY) {
    if (shouldDeferHeavyWorkForNavigation()) {
      deferRemaining(albumId, photoIds.slice(index));
      return;
    }

    const batchIds = photoIds.slice(index, index + GENERATE_CONCURRENCY);
    hydratePhotos(albumId, batchIds);

    await Promise.all(
      batchIds.map(async photoId => {
        try {
          const photo = getPhotoById(albumId, photoId);
          if (!photo || isUsableThumbnailUri(photo.file.thumbnailUri)) {
            return;
          }
          const nextFile = await ensureThumbnail(albumId, photo.file, photoId);
          if (nextFile.thumbnailUri) {
            applyThumbnailUri(albumId, photoId, nextFile.thumbnailUri);
          }
        } finally {
          if (options?.clearInFlight) {
            inFlightAlbumPhotoIds.delete(photoScheduleKey(albumId, photoId));
          }
        }
      }),
    );

    if (index + GENERATE_CONCURRENCY < photoIds.length) {
      await yieldToMain();
    }
  }
}

export async function resolveExistingThumbnailsForPhotos(
  albumId: string,
  photoIds: string[],
): Promise<void> {
  const missingIds = photoIds.filter(photoId => {
    const key = photoScheduleKey(albumId, photoId);
    if (existingThumbInFlight.has(key)) {
      return false;
    }
    const photo = getPhotoById(albumId, photoId);
    if (!photo || isUsableThumbnailUri(photo.file.thumbnailUri)) {
      return false;
    }
    existingThumbInFlight.add(key);
    return true;
  });

  if (missingIds.length === 0) {
    return;
  }

  for (
    let index = 0;
    index < missingIds.length;
    index += EXISTING_THUMB_CONCURRENCY
  ) {
    const batchIds = missingIds.slice(index, index + EXISTING_THUMB_CONCURRENCY);
    await Promise.all(
      batchIds.map(async photoId => {
        try {
          const photo = getPhotoById(albumId, photoId);
          if (!photo || isUsableThumbnailUri(photo.file.thumbnailUri)) {
            return;
          }
          const nextFile = await ensureThumbnail(albumId, photo.file, photoId);
          if (nextFile.thumbnailUri) {
            applyThumbnailUri(albumId, photoId, nextFile.thumbnailUri);
          }
        } finally {
          existingThumbInFlight.delete(photoScheduleKey(albumId, photoId));
        }
      }),
    );

    if (index + EXISTING_THUMB_CONCURRENCY < missingIds.length) {
      await yieldToMain();
    }
  }

  flushPendingPhotoGridRevisions();
}

export function scheduleResolveExistingThumbnails(
  albumId: string,
  photoIds: string[],
): void {
  resolveExistingQueue = resolveExistingQueue
    .then(() => resolveExistingThumbnailsForPhotos(albumId, photoIds))
    .catch(error => {
      console.error(
        '[thumbnailBackfill] Failed to resolve existing thumbnails',
        error,
      );
    });
}

export async function backfillAlbumThumbnails(albumId: string): Promise<void> {
  const photoIds = getPhotoIdsForAlbum(albumId);
  if (photoIds.length === 0) {
    return;
  }

  hydratePhotos(albumId, photoIds.slice(0, BATCH_SIZE));

  for (let index = 0; index < photoIds.length; index += BATCH_SIZE) {
    if (shouldDeferHeavyWorkForNavigation()) {
      scheduleThumbnailBackfillForPhotos(albumId, photoIds.slice(index));
      return;
    }

    const batchIds = photoIds.slice(index, index + BATCH_SIZE);
    await ensureThumbnailsForPhotoIds(albumId, batchIds);

    if (index + BATCH_SIZE < photoIds.length) {
      await yieldToMain();
    }
  }

  flushPendingPhotoGridRevisions();
}

export function scheduleThumbnailBackfill(albumId: string): void {
  const existingTimer = deferredFullAlbumTimers.get(albumId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    deferredFullAlbumTimers.delete(albumId);
    backfillAlbumThumbnails(albumId).catch(error => {
      console.error('[thumbnailBackfill] Failed to backfill thumbnails', error);
    });
  }, FULL_ALBUM_BACKFILL_DELAY_MS);
  deferredFullAlbumTimers.set(albumId, timer);
}

export function scheduleThumbnailBackfillForPhotos(
  albumId: string,
  photoIds: string[],
): void {
  if (photoIds.length === 0) {
    return;
  }

  if (runningAlbums.has(albumId)) {
    enqueuePending(albumId, photoIds);
    return;
  }

  const nextIds = photoIds.filter(photoId => {
    const key = photoScheduleKey(albumId, photoId);
    if (inFlightAlbumPhotoIds.has(key)) {
      return false;
    }
    inFlightAlbumPhotoIds.add(key);
    return true;
  });

  if (nextIds.length === 0) {
    return;
  }

  runScheduledThumbnailBackfill(albumId, nextIds);
}

function runScheduledThumbnailBackfill(
  albumId: string,
  photoIds: string[],
): void {
  runningAlbums.add(albumId);
  backfillPhotoThumbnails(albumId, photoIds)
    .catch(error => {
      console.error(
        '[thumbnailBackfill] Failed to backfill visible thumbnails',
        error,
      );
      deferRemaining(albumId, photoIds);
    })
    .finally(() => {
      const pending = pendingPhotoIdsByAlbum.get(albumId);
      const nextIds = pending ? Array.from(pending) : [];
      pendingPhotoIdsByAlbum.delete(albumId);
      runningAlbums.delete(albumId);

      if (nextIds.length === 0) {
        return;
      }

      for (const photoId of nextIds) {
        inFlightAlbumPhotoIds.delete(photoScheduleKey(albumId, photoId));
      }

      const startNext = () =>
        scheduleThumbnailBackfillForPhotos(albumId, nextIds);

      if (shouldDeferHeavyWorkForNavigation()) {
        setTimeout(startNext, 120);
        return;
      }
      startNext();
    });
}

async function backfillPhotoThumbnails(
  albumId: string,
  photoIds: string[],
): Promise<void> {
  await ensureThumbnailsForPhotoIds(albumId, photoIds, {clearInFlight: true});
  flushPendingPhotoGridRevisions();
}
