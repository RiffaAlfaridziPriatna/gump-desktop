import {useCulledAlbumStore} from '@context/culledAlbum';
import {loadAllLocalAlbumsIntoStore} from '@lib/culledAlbum/store';
import {CulledAlbum} from '@lib/culledAlbum/types';
import {useCallback, useEffect, useMemo, useState} from 'react';

function sortAlbums(albums: CulledAlbum[]): CulledAlbum[] {
  return [...albums].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function useLocalCulledAlbumList() {
  const [loadingAlbums, setLoadingAlbums] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const albums = useCulledAlbumStore(state =>
    sortAlbums(Object.values(state.albums)),
  );

  const refresh = useCallback(async () => {
    setLoadingAlbums(true);
    setError(null);
    try {
      await loadAllLocalAlbumsIntoStore();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load local albums',
      );
    } finally {
      setLoadingAlbums(false);
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
