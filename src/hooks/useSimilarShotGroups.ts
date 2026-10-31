import { useCulledAlbumStore } from '@context/culledAlbum';
import {
  indexGroupsByPhotoId,
  orderSimilarShotGroups,
  summarizeGroup,
  type SimilarShotPhoto,
} from '@lib/culling/similarShotGroups';
import { useCallback, useMemo } from 'react';

export function useSimilarShotGroups(
  albumId: string,
  photos: readonly SimilarShotPhoto[],
) {
  const storedGroups = useCulledAlbumStore(
    state => state.albums[albumId]?.cullingDuplicateGroups,
  );

  const photosById = useMemo(
    () => new Map(photos.map(photo => [photo.photoId, photo])),
    [photos],
  );
  const orderedGroups = useMemo(
    () => orderSimilarShotGroups(storedGroups, photosById),
    [storedGroups, photosById],
  );
  // Index the ordered list so index + 1 is the "Group n" number.
  const groupIndexByPhotoId = useMemo(
    () => indexGroupsByPhotoId(orderedGroups),
    [orderedGroups],
  );
  const summaryFor = useCallback(
    (groupIndex: number) => {
      const group = orderedGroups[groupIndex];
      return group ? summarizeGroup(group, photosById) : undefined;
    },
    [orderedGroups, photosById],
  );

  return {
    orderedGroups,
    groupIndexByPhotoId,
    summaryFor,
    hasGroups: orderedGroups.length > 0,
  };
}
