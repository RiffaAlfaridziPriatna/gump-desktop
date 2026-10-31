import {useRef} from 'react';

/**
 * Prev/next targets inside the navigation list. When the current photo is not
 * in the list (opened from a strip while a filter hides it), it is anchored
 * just after the last in-list photo that was shown.
 */
export function usePhotoNavigation(photoIds: string[], photoId: string) {
  const index = photoIds.indexOf(photoId);
  const lastIndexRef = useRef(-1);
  if (index >= 0) {
    lastIndexRef.current = index;
  }
  const anchor = index >= 0 ? index : lastIndexRef.current;
  if (anchor < 0) {
    return {prevId: undefined, nextId: undefined};
  }
  const prevId =
    index >= 0
      ? photoIds[index - 1]
      : photoIds[Math.min(anchor, photoIds.length - 1)];
  return {prevId, nextId: photoIds[anchor + 1]};
}
