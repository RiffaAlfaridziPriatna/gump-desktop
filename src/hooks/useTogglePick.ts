import {useCallback} from 'react';
import {cullingEngine} from '@lib/culling/cullingEngine';

// The single pick write shared by the grid card, the viewer and its
// similar-shots strip, so every surface updates the same store field.
export function useTogglePick(albumId: string) {
  return useCallback(
    (photoId: string, selected: boolean) =>
      cullingEngine.updateSelection(albumId, photoId, {selected}),
    [albumId],
  );
}
