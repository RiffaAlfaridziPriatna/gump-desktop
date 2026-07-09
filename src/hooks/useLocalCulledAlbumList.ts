import {useServerAlbumSync} from '@lib/culledAlbum/serverSync';
import {
  culledAlbumStore,
  hasAnyInFlightAlbumWork,
  loadAllLocalAlbumsIntoStore,
} from '@lib/culledAlbum/store';
import {CulledAlbumListItem} from '@lib/culledAlbum/types';
import {useIsFocused} from '@react-navigation/native';
import {useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';

function sortAlbums(albums: CulledAlbumListItem[]): CulledAlbumListItem[] {
  return [...albums].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function selectAlbumListItems(
  state: ReturnType<typeof culledAlbumStore.getState>,
): CulledAlbumListItem[] {
  return sortAlbums(
    Object.values(state.albums).map(album => ({
      albumId: album.albumId,
      name: album.name,
      title: album.title,
      cover: album.cover,
      coverMobile: album.coverMobile,
      cullingCompleted: album.cullingCompleted,
      cullingHasUploads: album.cullingHasUploads,
      link: album.link,
      createdAt: album.createdAt,
      totalPhotos: album.totalPhotos,
      totalStorage: album.totalStorage,
      syncedMediaCount: album.syncedMediaCount,
      syncedStorageGb: album.syncedStorageGb,
    })),
  );
}

function albumListItemsEqual(
  left: CulledAlbumListItem[],
  right: CulledAlbumListItem[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index++) {
    const a = left[index]!;
    const b = right[index]!;
    if (
      a.albumId !== b.albumId ||
      a.name !== b.name ||
      a.title !== b.title ||
      a.cullingCompleted !== b.cullingCompleted ||
      a.cullingHasUploads !== b.cullingHasUploads ||
      a.link !== b.link ||
      a.createdAt !== b.createdAt ||
      a.totalPhotos !== b.totalPhotos ||
      a.totalStorage !== b.totalStorage ||
      a.syncedMediaCount !== b.syncedMediaCount ||
      a.syncedStorageGb !== b.syncedStorageGb ||
      a.cover !== b.cover ||
      a.coverMobile !== b.coverMobile
    ) {
      return false;
    }
  }

  return true;
}

let albumListSnapshot: CulledAlbumListItem[] = [];

function getAlbumListSnapshot(): CulledAlbumListItem[] {
  const next = selectAlbumListItems(culledAlbumStore.getState());
  if (!albumListItemsEqual(albumListSnapshot, next)) {
    albumListSnapshot = next;
  }
  return albumListSnapshot;
}

function useAlbumListItems(isActive: boolean): CulledAlbumListItem[] {
  const snapshotRef = useRef<CulledAlbumListItem[]>([]);

  const albums = useSyncExternalStore(
    isActive ? culledAlbumStore.subscribe : () => () => undefined,
    getAlbumListSnapshot,
    getAlbumListSnapshot,
  );

  if (isActive) {
    snapshotRef.current = albums;
  }

  return isActive ? albums : snapshotRef.current;
}

export function useLocalCulledAlbumList() {
  const isFocused = useIsFocused();
  const [loadingAlbums, setLoadingAlbums] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enableSync, setEnableSync] = useState(false);

  const albums = useAlbumListItems(isFocused);

  const albumIds = useMemo(
    () => albums.map(album => album.albumId),
    [albums],
  );

  useServerAlbumSync(albumIds, enableSync && isFocused);

  const refresh = useCallback(async () => {
    setLoadingAlbums(true);
    setError(null);
    setEnableSync(false);
    try {
      if (!hasAnyInFlightAlbumWork()) {
        await loadAllLocalAlbumsIntoStore();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load local albums',
      );
    } finally {
      setLoadingAlbums(false);
      setEnableSync(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const localAlbumIds = useMemo(
    () => new Set(albums.map(album => album.albumId)),
    [albums],
  );

  return {
    loadingAlbums,
    albums,
    error,
    refresh,
    localAlbumIds,
    count: albums.length,
  };
}
