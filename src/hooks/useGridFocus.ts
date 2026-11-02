import {
  cardPressAction,
  resolveFocusedPhotoId,
} from '@lib/culledAlbum/gridFocus';
import {useCallback, useEffect, useRef, useState} from 'react';

/** Screen-owned grid focus: one `focusedPhotoId`, cleared when it leaves `shownPhotos`. */
export function useGridFocus(
  shownPhotos: readonly {photoId: string}[],
  onOpenDetail: (photoId: string) => void,
) {
  const [storedId, setStoredId] = useState<string | null>(null);
  const focusedPhotoId = resolveFocusedPhotoId(storedId, shownPhotos);
  const focusedRef = useRef(focusedPhotoId);
  focusedRef.current = focusedPhotoId;

  useEffect(() => {
    if (storedId !== focusedPhotoId) {
      setStoredId(null);
    }
  }, [storedId, focusedPhotoId]);

  const handleCardPress = useCallback(
    (photoId: string) => {
      if (cardPressAction(focusedRef.current, photoId) === 'open') {
        onOpenDetail(photoId);
        return;
      }
      setStoredId(photoId);
    },
    [onOpenDetail],
  );
  const clearFocus = useCallback(() => setStoredId(null), []);

  return {focusedPhotoId, handleCardPress, clearFocus};
}
