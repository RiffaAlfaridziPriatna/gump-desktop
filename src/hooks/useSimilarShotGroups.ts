import {
  useCulledAlbumPhotosState,
  useCulledAlbumStore,
} from '@context/culledAlbum';
import {
  indexGroupsByPhotoId,
  orderSimilarShotGroups,
  summarizeGroup,
} from '@lib/culling/similarShotGroups';
import { useCallback, useMemo } from 'react';

// Reads the full album photo list itself: a filtered list would make hidden
// members look stale and shrink the groups.
export function useSimilarShotGroups(albumId: string) {
  const storedGroups = useCulledAlbumStore(
    state => state.albums[albumId]?.cullingDuplicateGroups,
  );
  const photos = useCulledAlbumPhotosState(albumId);

  const photosById = useMemo(
    () => new Map(photos.map(photo => [photo.photoId, photo])),
    [photos],
  );
  const freshGroups = useMemo(
    () => orderSimilarShotGroups(storedGroups, photosById),
    [storedGroups, photosById],
  );
  const signature = useMemo(
    () =>
      freshGroups
        .map(group => `${group.groupId}:${group.photoIds.join(',')}`)
        .join('|'),
    [freshGroups],
  );
  // The photo list gets a new identity on every pick or star change; keep the
  // groups and index stable unless membership or order actually changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on structure, not identity
  const orderedGroups = useMemo(() => freshGroups, [signature]);
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
