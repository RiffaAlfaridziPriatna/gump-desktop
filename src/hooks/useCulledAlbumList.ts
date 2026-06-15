import {make} from '@lib/di';
import {APIService, APIResponse, assertAPIException} from '@services/api';
import {useCallback, useEffect, useReducer, useState} from 'react';

export type CulledAlbumListSearchValues = {
  keyword?: string;
  year?: number;
  month?: number;
  sort?: 'default' | 'creation_time' | 'size';
  order?: 'asc' | 'desc';
};

type UpdateAlbumsParams =
  | {action: 'replace'; data: APIResponse.CulledAlbumList}
  | {action: 'append'; data: APIResponse.CulledAlbumList}
  | {action: 'remove'; albumId: string}
  | {action: 'prepend'; album: APIResponse.CulledAlbum};

const emptyAlbumList: APIResponse.CulledAlbumList = {
  next: null,
  previous: null,
  results: [],
  count: 0,
};

export function filterAvailableSourceAlbums(
  siteAlbums: APIResponse.Album[],
  culledAlbums: APIResponse.CulledAlbum[],
): APIResponse.Album[] {
  const culledNames = new Set(culledAlbums.map(album => album.name));
  return siteAlbums.filter(
    album => album.totalMediaCount === 0 && !culledNames.has(album.name),
  );
}

export function useCulledAlbumList(search: CulledAlbumListSearchValues = {}) {
  const api = make(APIService);
  const [loadingAlbums, setLoadingAlbums] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [albums, updateAlbums] = useReducer(
    (state: APIResponse.CulledAlbumList, params: UpdateAlbumsParams) => {
      if (params.action === 'append') {
        return {
          ...state,
          next: params.data.next,
          results: state.results.concat(params.data.results),
        };
      }
      if (params.action === 'remove') {
        return {
          ...state,
          count: Math.max(state.count - 1, 0),
          results: state.results.filter(album => album.id !== params.albumId),
        };
      }
      if (params.action === 'prepend') {
        return {
          ...state,
          count: state.count + 1,
          results: [params.album, ...state.results],
        };
      }
      return {
        next: params.data.next,
        previous: params.data.previous,
        results: params.data.results,
        count: params.data.count,
      };
    },
    emptyAlbumList,
  );

  const fetchAlbums = useCallback(
    async (cursor?: string) => {
      setLoadingAlbums(true);
      setError(null);
      try {
        const res = await api.culledAlbum.getAll({
          cursor,
          keyword: search.keyword,
          year: search.year,
          month: search.month,
          sort: search.sort,
          order: search.order,
        });
        updateAlbums({
          action: cursor ? 'append' : 'replace',
          data: res,
        });
      } catch (err) {
        assertAPIException(err);
        setError(err.message);
      } finally {
        setLoadingAlbums(false);
      }
    },
    [api, search.keyword, search.month, search.order, search.sort, search.year],
  );

  useEffect(() => {
    fetchAlbums();
  }, [fetchAlbums]);

  const loadMore = useCallback(() => {
    if (albums.next && !loadingAlbums) {
      fetchAlbums(albums.next);
    }
  }, [albums.next, fetchAlbums, loadingAlbums]);

  const removeAlbum = useCallback((albumId: string) => {
    updateAlbums({action: 'remove', albumId});
  }, []);

  const deleteAlbum = useCallback(
    async (album: APIResponse.CulledAlbum) => {
      updateAlbums({action: 'remove', albumId: album.id});

      try {
        await api.culledAlbum.delete(album.id);
      } catch (err) {
        updateAlbums({action: 'prepend', album});
        throw err;
      }
    },
    [api],
  );

  const addAlbum = useCallback((album: APIResponse.CulledAlbum) => {
    updateAlbums({action: 'prepend', album});
  }, []);

  const createFromSiteAlbum = useCallback(
    (siteAlbum: APIResponse.Album) =>
      api.culledAlbum.create({
        name: siteAlbum.name,
        title: siteAlbum.title ?? undefined,
      }),
    [api],
  );

  const refresh = useCallback(() => fetchAlbums(), [fetchAlbums]);

  return {
    loadingAlbums,
    albums,
    error,
    updateAlbums,
    loadMore,
    removeAlbum,
    deleteAlbum,
    addAlbum,
    createFromSiteAlbum,
    refresh,
    hasMore: Boolean(albums.next),
  };
}
