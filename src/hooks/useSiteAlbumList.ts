import {make} from '@lib/di';
import {APIService, APIResponse} from '@services/api';
import {useCallback, useEffect, useReducer, useState} from 'react';

export type SiteAlbumListSearchValues = {
  keyword?: string;
  year?: number;
  month?: number;
  sort?: 'default' | 'creation_time' | 'size';
  order?: 'asc' | 'desc';
};

type UpdateAlbumsParams =
  | {action: 'replace'; data: APIResponse.AlbumList}
  | {action: 'append'; data: APIResponse.AlbumList};

const emptyAlbumList: APIResponse.AlbumList = {
  next: null,
  previous: null,
  results: [],
  count: 0,
};

export function useSiteAlbumList(search: SiteAlbumListSearchValues = {}) {
  const api = make(APIService);
  const [loadingAlbums, setLoadingAlbums] = useState(true);
  const [albums, updateAlbums] = useReducer(
    (state: APIResponse.AlbumList, params: UpdateAlbumsParams) => {
      if (params.action === 'append') {
        return {
          ...state,
          next: params.data.next,
          results: state.results.concat(params.data.results),
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
      try {
        const res = await api.album.getAll({
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

  const refresh = useCallback(() => fetchAlbums(), [fetchAlbums]);

  return {
    loadingAlbums,
    albums,
    loadMore,
    refresh,
    hasMore: Boolean(albums.next),
  };
}
