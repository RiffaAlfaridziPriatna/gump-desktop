import {make} from '@lib/di';
import {APIService, APIResponse, assertAPIException} from '@services/api';
import {useInfiniteQuery} from '@tanstack/react-query';
import {useCallback, useMemo} from 'react';

export type SiteAlbumListSearchValues = {
  keyword?: string;
  year?: number;
  month?: number;
  sort?: 'default' | 'creation_time' | 'size';
  order?: 'asc' | 'desc';
};

export function useSiteAlbumList(search: SiteAlbumListSearchValues = {}) {
  const api = make(APIService);

  const queryKey = [
    'siteAlbums',
    search.keyword,
    search.year,
    search.month,
    search.sort,
    search.order,
  ];

  const {
    data,
    error: queryError,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey,
    queryFn: async ({pageParam}) => {
      try {
        return await api.album.getAll({
          cursor: pageParam,
          keyword: search.keyword,
          year: search.year,
          month: search.month,
          sort: search.sort,
          order: search.order,
        });
      } catch (err) {
        assertAPIException(err);
        throw err;
      }
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: lastPage => lastPage.next ?? undefined,
    staleTime: 300000,
  });

  const albums = useMemo(() => {
    if (!data) {
      return {
        next: null,
        previous: null,
        results: [],
        count: 0,
      };
    }

    const allResults = data.pages.flatMap(page => page.results);
    const lastPage = data.pages[data.pages.length - 1];

    return {
      next: lastPage?.next ?? null,
      previous: lastPage?.previous ?? null,
      results: allResults,
      count: lastPage?.count ?? 0,
    };
  }, [data]);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  return {
    loadingAlbums: isFetching,
    albums,
    error: queryError ? String(queryError) : null,
    loadMore,
    refresh,
    hasMore: Boolean(hasNextPage),
  };
}
