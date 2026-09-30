import {useAuthState} from '@hooks/useAuth';
import {isLocalAlbumMarkedAccessible} from '@lib/culledAlbum/localAlbumAccess';
import {
  resolveAccessibleLocalAlbumIds,
  useServerAlbumSync,
} from '@lib/culledAlbum/serverSync';
import {
  culledAlbumStore,
  loadAllLocalAlbumsIntoStore,
} from '@lib/culledAlbum/store';
import {hasActiveQueueWork} from '@lib/culledAlbum/uploadQueueStore';
import {
  runOrDeferHeavyWorkForNavigation,
  shouldDeferHeavyWorkForNavigation,
} from '@lib/navigation/uploadAwareNavigation';
import {CulledAlbumListItem} from '@lib/culledAlbum/types';
import {reportError} from '@lib/observability';
import {useIsFocused} from '@react-navigation/native';
import {useCallback, useEffect, useMemo, useState, useSyncExternalStore} from 'react';

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

function useAlbumListItems(): CulledAlbumListItem[] {
  return useSyncExternalStore(
    culledAlbumStore.subscribe,
    getAlbumListSnapshot,
    getAlbumListSnapshot,
  );
}

export function useLocalCulledAlbumList() {
  const isFocused = useIsFocused();
  const isAuthenticated = useAuthState(state => state.isAuthenticated);
  const [loadingAlbums, setLoadingAlbums] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enableSync, setEnableSync] = useState(false);
  // null = access not resolved yet (fail closed until getByIds returns)
  const [accessibleAlbumIds, setAccessibleAlbumIds] = useState<ReadonlySet<
    string
  > | null>(null);

  const storedAlbums = useAlbumListItems();

  const albums = useMemo(() => {
    if (accessibleAlbumIds == null) {
      return [];
    }
    return storedAlbums.filter(
      album =>
        accessibleAlbumIds.has(album.albumId) ||
        isLocalAlbumMarkedAccessible(album.albumId),
    );
  }, [storedAlbums, accessibleAlbumIds]);

  const albumIds = useMemo(
    () => albums.map(album => album.albumId),
    [albums],
  );

  useServerAlbumSync(albumIds, enableSync && isFocused);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setAccessibleAlbumIds(null);
      setLoadingAlbums(false);
      setEnableSync(false);
      setError(null);
      return;
    }

    if (shouldDeferHeavyWorkForNavigation()) {
      runOrDeferHeavyWorkForNavigation(() => {
        void refresh();
      });
      return;
    }

    setLoadingAlbums(true);
    setError(null);
    setEnableSync(false);
    try {
      if (!hasActiveQueueWork()) {
        await loadAllLocalAlbumsIntoStore();
      }

      const localIds = Object.keys(culledAlbumStore.getState().albums);
      const accessibleIds = await resolveAccessibleLocalAlbumIds(localIds);
      setAccessibleAlbumIds(accessibleIds);
    } catch (err) {
      // Fail closed: do not show other accounts' local albums if access check fails.
      setAccessibleAlbumIds(new Set());
      reportError(err, {
        source: 'localCulledAlbumList',
        operation: 'resolve_accessible_albums',
      });
      setError(
        err instanceof Error ? err.message : 'Failed to load local albums',
      );
    } finally {
      setLoadingAlbums(false);
      setEnableSync(true);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void refresh();
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
