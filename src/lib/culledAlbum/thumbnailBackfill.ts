import {yieldToMain} from '@lib/async/yieldToMain';
import {syncPhotoFromStore} from '@/application/syncPhotoRepository';
import {hydratePhotos} from '@lib/culledAlbum/photoLoader';
import {photoKey, photoStateStore} from '@lib/culledAlbum/photoStateStore';
import {getPhotoById} from '@lib/culledAlbum/store';
import {
  getFileThumbnailDimensions,
  putCachedImageDimensions,
} from '@lib/media/imageDimensions';
import {shouldDeferHeavyWorkForNavigation} from '@lib/navigation/uploadAwareNavigation';
import {ensureThumbnail, isUsableThumbnailUri} from '@lib/storage/localStorage';

const EXISTING_THUMB_CONCURRENCY = 12;
const GENERATE_CONCURRENCY = 8;
const inFlightAlbumPhotoIds = new Set<string>();
const runningAlbums = new Set<string>();
const pendingPhotoIdsByAlbum = new Map<string, Set<string>>();
const existingThumbInFlight = new Set<string>();
let resolveExistingQueue: Promise<void> = Promise.resolve();

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
  dimensions?: {width: number; height: number} | null,
): boolean {
  const key = photoKey(albumId, photoId);
  let applied = false;
  const nextWidth = dimensions?.width ?? 0;
  const nextHeight = dimensions?.height ?? 0;
  const hasDimensions = nextWidth > 0 && nextHeight > 0;

  photoStateStore.setState(state => {
    const photo = state.photoState[key];
    if (!photo) {
      return;
    }
    const uriUnchanged = photo.file.thumbnailUri === thumbnailUri;
    const dimsUnchanged =
      !hasDimensions ||
      (photo.file.thumbnailWidth === nextWidth &&
        photo.file.thumbnailHeight === nextHeight);
    if (uriUnchanged && dimsUnchanged) {
      return;
    }
    photo.file = {
      ...photo.file,
      thumbnailUri,
      ...(hasDimensions
        ? {thumbnailWidth: nextWidth, thumbnailHeight: nextHeight}
        : {}),
    };
    applied = true;
  });

  if (applied) {
    if (hasDimensions) {
      putCachedImageDimensions(thumbnailUri, {
        width: nextWidth,
        height: nextHeight,
      });
    }
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
            applyThumbnailUri(
              albumId,
              photoId,
              nextFile.thumbnailUri,
              getFileThumbnailDimensions(nextFile),
            );
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
            applyThumbnailUri(
              albumId,
              photoId,
              nextFile.thumbnailUri,
              getFileThumbnailDimensions(nextFile),
            );
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
}
