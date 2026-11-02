/** Focus survives only while its photo is in the shown set. */
export function resolveFocusedPhotoId(
  focusedPhotoId: string | null,
  shownPhotoIds: readonly {photoId: string}[],
): string | null {
  if (focusedPhotoId == null) {
    return null;
  }
  return shownPhotoIds.some(photo => photo.photoId === focusedPhotoId)
    ? focusedPhotoId
    : null;
}

/** First press focuses; a press on the already focused photo opens it. */
export function cardPressAction(
  focusedPhotoId: string | null,
  pressedPhotoId: string,
): 'focus' | 'open' {
  return focusedPhotoId === pressedPhotoId ? 'open' : 'focus';
}
