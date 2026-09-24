import {useLocalCulledAlbumList} from '@hooks/useLocalCulledAlbumList';
import {useLayout} from '@hooks/useLayout';
import {
  countAvailableSourceAlbums,
  getSelectAlbumPrefetchThreshold,
} from '@lib/culledAlbum/selectAlbum';
import {make} from '@di/tsyringe';
import {APIService, APIResponse, assertAPIException} from '@services/api';
import {useInfiniteQuery} from '@tanstack/react-query';
import {useCallback, useEffect, useMemo} from 'react';

export type SiteAlbumListSearchValues = {
  keyword?: string;
  year?: number;
  month?: number;
  sort?: 'default' | 'creation_time' | 'size';
  order?: 'asc' | 'desc';
};

export const SITE_ALBUM_LIST_STALE_TIME_MS = 300_000;

export function siteAlbumListQueryKey(search: SiteAlbumListSearchValues = {}) {
  return [
    'siteAlbums',
    search.keyword,
    search.year,
    search.month,
    search.sort,
    search.order,
  ] as const;
}

type UseSiteAlbumListOptions = SiteAlbumListSearchValues & {
  /**
   * Keep fetching cursor pages until this many selectable empty albums are
   * cached, or until there are no more pages.
   */
  prefetchUntilSelectable?: number;
  localAlbumIds?: ReadonlySet<string>;
};

export function useSiteAlbumList(options: UseSiteAlbumListOptions = {}) {
  const {
    prefetchUntilSelectable,
    localAlbumIds = EMPTY_LOCAL_ALBUM_IDS,
    ...search
  } = options;
  const api = make(APIService);
  const queryKey = siteAlbumListQueryKey(search);

  const {
    data,
    error: queryError,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    isPending,
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
    staleTime: SITE_ALBUM_LIST_STALE_TIME_MS,
  });

  const fetchedAlbums = useMemo(
    () => data?.pages.flatMap(page => page.results) ?? [],
    [data],
  );

  const selectableCount = useMemo(
    () => countAvailableSourceAlbums(fetchedAlbums, localAlbumIds),
    [fetchedAlbums, localAlbumIds],
  );

  useEffect(() => {
    if (prefetchUntilSelectable == null) {
      return;
    }
    if (!hasNextPage || isFetchingNextPage) {
      return;
    }
    if (selectableCount >= prefetchUntilSelectable) {
      return;
    }
    void fetchNextPage();
  }, [
    prefetchUntilSelectable,
    hasNextPage,
    isFetchingNextPage,
    selectableCount,
    fetchNextPage,
  ]);

  const albums = useMemo(() => {
    if (!data) {
      return {
        next: null,
        previous: null,
        results: [] as APIResponse.Album[],
        count: 0,
      };
    }

    const lastPage = data.pages[data.pages.length - 1];

    return {
      next: lastPage?.next ?? null,
      previous: lastPage?.previous ?? null,
      results: fetchedAlbums,
      count: lastPage?.count ?? 0,
    };
  }, [data, fetchedAlbums]);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const refresh = useCallback(() => {
    return refetch();
  }, [refetch]);

  return {
    // Full-screen load only while there is no cached page yet.
    // Background focus/pull refetches keep the existing list visible.
    loadingAlbums: isPending && isFetching && !isFetchingNextPage,
    albums,
    error: queryError ? String(queryError) : null,
    loadMore,
    refresh,
    hasMore: Boolean(hasNextPage),
    selectableCount,
  };
}

const EMPTY_LOCAL_ALBUM_IDS: ReadonlySet<string> = new Set();

/** Warm enough selectable empty albums for Select Album scroll pagination. */
export function usePrefetchSelectableSiteAlbums() {
  const {albumGridColumns} = useLayout();
  const {localAlbumIds} = useLocalCulledAlbumList();
  const prefetchUntilSelectable =
    getSelectAlbumPrefetchThreshold(albumGridColumns);

  useSiteAlbumList({
    prefetchUntilSelectable,
    localAlbumIds,
  });
}
