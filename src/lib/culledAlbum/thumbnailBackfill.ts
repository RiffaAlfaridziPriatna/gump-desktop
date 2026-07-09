import {yieldToMain} from '@lib/async/yieldToMain';
import {
  getPhotoIdsForAlbum,
  hydratePhotos,
} from '@lib/culledAlbum/photoLoader';
import {getPhotoById, updatePhoto} from '@lib/culledAlbum/store';
import {
  ensureThumbnail,
} from '@lib/storage/localStorage';

const BATCH_SIZE = 8;
const scheduledAlbumPhotoIds = new Set<string>();
const runningAlbums = new Set<string>();
const pendingPhotoIdsByAlbum = new Map<string, Set<string>>();

export async function backfillAlbumThumbnails(albumId: string): Promise<void> {
  const photoIds = getPhotoIdsForAlbum(albumId);
  if (photoIds.length === 0) {
    return;
  }

  hydratePhotos(albumId, photoIds.slice(0, BATCH_SIZE));

  for (let index = 0; index < photoIds.length; index += BATCH_SIZE) {
    const batchIds = photoIds.slice(index, index + BATCH_SIZE);
    hydratePhotos(albumId, batchIds);

    for (const photoId of batchIds) {
      const photo = getPhotoById(albumId, photoId);
      if (!photo) {
        continue;
      }

      const nextFile = await ensureThumbnail(albumId, photo.file, photoId);
      if (nextFile.thumbnailUri) {
        updatePhoto(
          albumId,
          photoId,
          entry => {
            entry.file = nextFile;
          },
          {recomputeTotals: false},
        );
      }
    }

    if (index + BATCH_SIZE < photoIds.length) {
      await yieldToMain();
    }
  }
}

export function scheduleThumbnailBackfill(albumId: string): void {
  backfillAlbumThumbnails(albumId).catch(error => {
    console.error('[thumbnailBackfill] Failed to backfill thumbnails', error);
  });
}

export function scheduleThumbnailBackfillForPhotos(
  albumId: string,
  photoIds: string[],
): void {
  const nextIds = photoIds.filter(photoId => {
    const key = `${albumId}:${photoId}`;
    if (scheduledAlbumPhotoIds.has(key)) {
      return false;
    }
    scheduledAlbumPhotoIds.add(key);
    return true;
  });

  if (nextIds.length === 0 || runningAlbums.has(albumId)) {
    if (nextIds.length > 0) {
      const pending = pendingPhotoIdsByAlbum.get(albumId) ?? new Set<string>();
      for (const photoId of nextIds) {
        pending.add(photoId);
      }
      pendingPhotoIdsByAlbum.set(albumId, pending);
    }
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
      console.error('[thumbnailBackfill] Failed to backfill visible thumbnails', error);
    })
    .finally(() => {
      const pending = pendingPhotoIdsByAlbum.get(albumId);
      const nextIds = pending ? Array.from(pending) : [];
      pendingPhotoIdsByAlbum.delete(albumId);

      if (nextIds.length > 0) {
        runScheduledThumbnailBackfill(albumId, nextIds);
        return;
      }

      runningAlbums.delete(albumId);
    });
}

async function backfillPhotoThumbnails(
  albumId: string,
  photoIds: string[],
): Promise<void> {
  for (let index = 0; index < photoIds.length; index += BATCH_SIZE) {
    const batchIds = photoIds.slice(index, index + BATCH_SIZE);
    hydratePhotos(albumId, batchIds);

    for (const photoId of batchIds) {
      const photo = getPhotoById(albumId, photoId);
      if (!photo) {
        continue;
      }

      const nextFile = await ensureThumbnail(albumId, photo.file, photoId);
      if (nextFile.thumbnailUri) {
        updatePhoto(
          albumId,
          photoId,
          entry => {
            entry.file = nextFile;
          },
          {recomputeTotals: false},
        );
      }
    }

    if (index + BATCH_SIZE < photoIds.length) {
      await yieldToMain();
    }
  }
}
