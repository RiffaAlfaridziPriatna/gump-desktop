import {
  isAiSelectionLevel,
  isRecommendedAtLevel,
  type AiSelectionLevel,
} from '@domain/valueObjects/AiSelection';
import { yieldToMain } from '@lib/async/yieldToMain';
import { getPhotoIdsForAlbum } from '@lib/culledAlbum/photoLoader';
import {
  ensureAlbumLoaded,
  getAlbum,
  getPhotoById,
  setAlbumAiSelectionLevel,
} from '@lib/culledAlbum/store';

const CHUNK_SIZE = 50;
const latestApply = new Map<string, symbol>();

/**
 * Sets `aiSelected` on every photo of the album from its star rating and the
 * level (uploaded and in-flight photos included: only a local flag changes),
 * then saves the album level. Throws before any change when the album or level
 * is invalid. A newer call for the same album stops this one at its next
 * chunk; photos already changed stay changed (no rollback), the cancelled run
 * does not save the level and returns its partial count. A failure rejects
 * and leaves the level unchanged, but photos already changed stay changed, so
 * the caller must catch it. `updateChunk` must not persist. `syncStats` and
 * `persist` run once when the run ends with changes and no level save
 * (failure or cancel); on success the level setter persists the album once,
 * stats included. Returns the number of photos with `aiSelected` true.
 */
export async function applyAiSelectionLevel(
  albumId: string,
  level: AiSelectionLevel,
  updateChunk: (photoIds: string[], level: AiSelectionLevel) => Promise<void>,
  syncStats: () => void,
  persist: () => Promise<void>,
): Promise<number> {
  await ensureAlbumLoaded(albumId);
  if (!getAlbum(albumId)) {
    throw new Error('Album not found');
  }
  if (!isAiSelectionLevel(level)) {
    throw new Error('Invalid ai selection level');
  }
  const token = Symbol(albumId);
  latestApply.set(albumId, token);
  const photoIds = getPhotoIdsForAlbum(albumId);
  const countRecommended = () =>
    photoIds.filter(id => getPhotoById(albumId, id)?.aiSelected).length;
  let dirty = false;
  let levelSaved = false;
  try {
    for (let i = 0; i < photoIds.length; i += CHUNK_SIZE) {
      if (latestApply.get(albumId) !== token) {
        return countRecommended();
      }
      const todo = photoIds.slice(i, i + CHUNK_SIZE).filter(photoId => {
        const photo = getPhotoById(albumId, photoId);
        return (
          !!photo &&
          photo.aiSelected !== isRecommendedAtLevel(photo.starRating, level)
        );
      });
      if (todo.length > 0) {
        dirty = true;
        await updateChunk(todo, level);
      }
      await yieldToMain();
    }
    if (latestApply.get(albumId) !== token) {
      return countRecommended();
    }
    if (dirty) {
      syncStats();
    }
    await setAlbumAiSelectionLevel(albumId, level);
    levelSaved = true;
    return countRecommended();
  } finally {
    if (latestApply.get(albumId) === token) {
      latestApply.delete(albumId);
    }
    if (dirty && !levelSaved) {
      syncStats();
      await persist();
    }
  }
}
