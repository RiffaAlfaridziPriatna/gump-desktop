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
 * A newer call for the same album stops this one at its next chunk.
 * Returns the number of photos changed.
 */
export async function applyAlbumLook(
  albumId: string,
  lookId: LookId,
  scope: ApplyAlbumLookScope,
  updateChunk: (photoIds: string[]) => Promise<void>,
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
  await setAlbumDefaultLook(albumId, lookId);
  if (scope === 'newPhotosOnly') {
    return 0;
  }

  const photoIds = getPhotoIdsForAlbum(albumId);
  let changed = 0;
  for (let i = 0; i < photoIds.length; i += CHUNK_SIZE) {
    if (latestApply.get(albumId) !== token) {
      return changed;
    }
    const eligible = photoIds.slice(i, i + CHUNK_SIZE).filter(photoId => {
      const photo = getPhotoById(albumId, photoId);
      return (
        !!photo &&
        !isCulledPhotoDisabled(photo) &&
        !isServerUploadInFlight(photo)
      );
    });
    if (eligible.length > 0) {
      await updateChunk(eligible);
      changed += eligible.length;
    }
    await yieldToMain();
  }
  if (latestApply.get(albumId) === token) {
    latestApply.delete(albumId);
  }
  return changed;
}
