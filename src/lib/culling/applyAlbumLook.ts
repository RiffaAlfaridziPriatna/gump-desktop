import { yieldToMain } from '@lib/async/yieldToMain';
import { getPhotoIdsForAlbum } from '@lib/culledAlbum/photoLoader';
import {
  ensureAlbumLoaded,
  getAlbum,
  getPhotoById,
  setAlbumDefaultLook,
} from '@lib/culledAlbum/store';
import {
  isCulledPhotoDisabled,
  isServerUploadInFlight,
} from '@lib/culledAlbum/types';
import { isLookId, type LookId } from '@lib/look/types';

export type ApplyAlbumLookScope = 'allPhotos' | 'newPhotosOnly';

const CHUNK_SIZE = 50;
const latestApply = new Map<string, symbol>();

/**
 * Sets the album default look; for 'allPhotos' also restyles eligible photos
 * in chunks. Throws before any change when the album or look id is invalid.
 * A newer call for the same album stops this one at its next chunk; photos
 * already changed stay changed (no rollback) and the cancelled run returns
 * its partial count. A failure after the first chunk rejects with a partial
 * change, so the caller must catch it. `updateChunk` must not persist;
 * `persist` runs once when the run ends (also after a failure or cancel).
 * Returns the number of photos whose look actually changed.
 */
export async function applyAlbumLook(
  albumId: string,
  lookId: LookId,
  scope: ApplyAlbumLookScope,
  updateChunk: (photoIds: string[]) => Promise<void>,
  persist: () => Promise<void>,
): Promise<number> {
  await ensureAlbumLoaded(albumId);
  if (!getAlbum(albumId)) {
    throw new Error('Album not found');
  }
  if (!isLookId(lookId)) {
    throw new Error('Invalid look id');
  }
  const token = Symbol(albumId);
  latestApply.set(albumId, token);
  let changed = 0;
  let dirty = false;
  try {
    await setAlbumDefaultLook(albumId, lookId);
    if (scope === 'newPhotosOnly') {
      return 0;
    }
    const photoIds = getPhotoIdsForAlbum(albumId);
    for (let i = 0; i < photoIds.length; i += CHUNK_SIZE) {
      if (latestApply.get(albumId) !== token) {
        break;
      }
      // shortcut: eligibility is read just before the chunk write; an upload
      // starting inside updateLook's first await is not caught.
      const todo = photoIds.slice(i, i + CHUNK_SIZE).filter(photoId => {
        const photo = getPhotoById(albumId, photoId);
        return (
          !!photo &&
          photo.lookId !== lookId &&
          !isCulledPhotoDisabled(photo) &&
          !isServerUploadInFlight(photo)
        );
      });
      if (todo.length > 0) {
        dirty = true;
        await updateChunk(todo);
        changed += todo.filter(id => !!getPhotoById(albumId, id)).length;
      }
      await yieldToMain();
    }
    return changed;
  } finally {
    if (latestApply.get(albumId) === token) {
      latestApply.delete(albumId);
    }
    if (dirty) {
      await persist();
    }
  }
}
