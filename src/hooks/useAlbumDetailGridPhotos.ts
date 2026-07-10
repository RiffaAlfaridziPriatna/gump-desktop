import {culledAlbumStore} from '@lib/culledAlbum/store';
import {
  stabilizeAlbumGridFiles,
  type AlbumGridFileItem,
} from '@lib/culledAlbum/stableAlbumGridFiles';
import {photoKey, photoStateStore} from '@lib/culledAlbum/photoStateStore';
import {useStateStore} from '@lib/react/state';
import {useMemo, useRef} from 'react';

const EMPTY_PHOTO_IDS: string[] = [];

function buildAlbumGridItems(albumId: string, photoOrder: string[]): AlbumGridFileItem[] {
  const album = culledAlbumStore.getState().albums[albumId];
  const albumById = new Map(
    (album?.photos ?? []).map(photo => [photo.photoId, photo]),
  );
  const state = photoStateStore.getState();
  const items: AlbumGridFileItem[] = [];

  for (const photoId of photoOrder) {
    const photo =
      state.photoState[photoKey(albumId, photoId)] ?? albumById.get(photoId);
    if (!photo || photo.status !== 'uploaded') {
      continue;
    }
    items.push({photoId, file: photo.file});
  }

  return items;
}

export function useAlbumDetailGridPhotos(albumId: string): AlbumGridFileItem[] {
  const photoOrder = useStateStore(
    photoStateStore,
    state => state.photoOrder[albumId] ?? EMPTY_PHOTO_IDS,
  );
  const gridRevision = useStateStore(
    photoStateStore,
    state => state.gridRevision[albumId] ?? 0,
  );
  const hydratedCount = useStateStore(photoStateStore, state => {
    const order = state.photoOrder[albumId];
    if (!order || order.length === 0) {
      return 0;
    }
    let count = 0;
    for (const photoId of order) {
      if (state.photoState[photoKey(albumId, photoId)]) {
        count++;
      }
    }
    return count;
  });
  const stableCacheRef = useRef(new Map<string, AlbumGridFileItem>());
  const previousItemsRef = useRef<AlbumGridFileItem[]>([]);

  return useMemo(() => {
    const nextItems = buildAlbumGridItems(albumId, photoOrder);
    const stableItems = stabilizeAlbumGridFiles(
      stableCacheRef.current,
      nextItems,
      previousItemsRef.current,
    );
    previousItemsRef.current = stableItems;
    return stableItems;
  }, [albumId, gridRevision, hydratedCount, photoOrder]);
}
