import {scheduleHydrateVisiblePhotos} from '@hooks/useVisiblePhotos';
import {useCulledAlbumPhoto} from '@context/culledAlbum';
import type {AlbumGridFileItem} from '@lib/culledAlbum/stableAlbumGridFiles';
import {persistThumbnailDimensions} from '@lib/culledAlbum/persistThumbnailDimensions';
import {scheduleThumbnailBackfillForPhotos} from '@lib/culledAlbum/thumbnailBackfill';
import {
  getCachedImageDimensions,
  getCulledAlbumThumbnailLayout,
  getFileThumbnailDimensions,
  loadImageDimensions,
  putCachedImageDimensions,
  type ImageDimensions,
} from '@lib/media/imageDimensions';
import {
  cancelScrollImagePreload,
  getScrollPreloadRange,
  scheduleScrollImagePreload,
  SCROLL_GRID_VISIBLE_PADDING,
} from '@lib/media/scrollImagePreload';
import {
  isUsableThumbnailUri,
  resolveGridDisplayUri,
} from '@lib/storage/localStorage';
import {colors} from '@lib/ui/colors';
import {
  createContext,
  forwardRef,
  memo,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  FlatList,
  Image,
  type ImageLoadEventData,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  ListRenderItemInfo,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewToken,
  type NativeSyntheticEvent,
} from 'react-native';

const COLUMNS = 3;
const ASPECT_RATIO = 3 / 2;
const HORIZONTAL_PADDING = 48;
const GAP = 8;
const RESIZE_SETTLE_MS = 150;
const PLACEHOLDER_INITIAL_ROWS = 8;
const GRAY_FILL_BATCH_PERIOD_MS = 50;
const SCROLL_SETTLE_MS = 120;
const SCROLL_TO_TOP_DURATION_MS = 450;
const EMPTY_IMAGE_LOAD_IDS = new Set<string>();

type ImageLoadStore = {
  subscribe: (listener: () => void) => () => void;
  getIds: () => Set<string>;
  setIds: (nextIds: Set<string>) => void;
};

const PhotoGridImageLoadContext = createContext<ImageLoadStore | null>(null);

function setsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

function createImageLoadStore(): ImageLoadStore {
  let ids = EMPTY_IMAGE_LOAD_IDS;
  const listeners = new Set<() => void>();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getIds() {
      return ids;
    },
    setIds(nextIds) {
      if (setsEqual(ids, nextIds)) {
        return;
      }
      ids = nextIds;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

function useShouldLoadGridImage(photoId: string): boolean {
  const store = useContext(PhotoGridImageLoadContext);
  return useSyncExternalStore(
    store?.subscribe ?? subscribeNoop,
    () => store?.getIds().has(photoId) ?? true,
  );
}

function subscribeNoop(): () => void {
  return () => undefined;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function resolveThumbnailSize(
  file: {thumbnailWidth?: number | null; thumbnailHeight?: number | null} | undefined,
  uri: string,
): ImageDimensions | null {
  const stored = file ? getFileThumbnailDimensions(file) : null;
  if (stored) {
    putCachedImageDimensions(uri, stored);
    return stored;
  }
  return uri ? getCachedImageDimensions(uri) ?? null : null;
}

const PhotoGridCellImage = memo(
  function PhotoGridCellImage({
    albumId,
    photoId,
    width,
    height,
    deferHeavyMediaWork,
  }: {
    albumId?: string;
    photoId: string;
    width: number;
    height: number;
    deferHeavyMediaWork: boolean;
  }) {
    const shouldLoadImage = useShouldLoadGridImage(photoId);
    const photo = useCulledAlbumPhoto(albumId, photoId);
    const file = photo?.file;
    const uri = file ? resolveGridDisplayUri(file) ?? '' : '';
    const [isLoaded, setIsLoaded] = useState(false);
    const [imageSize, setImageSize] = useState<ImageDimensions | null>(() =>
      resolveThumbnailSize(file, uri),
    );
    const displayedUriRef = useRef(uri);

    useEffect(() => {
      if (displayedUriRef.current === uri) {
        return;
      }
      displayedUriRef.current = uri;
      setIsLoaded(false);
      setImageSize(resolveThumbnailSize(file, uri));
    }, [file, uri]);

    const imageLayout = useMemo(() => {
      if (!imageSize) {
        return null;
      }

      return getCulledAlbumThumbnailLayout(
        width,
        height,
        imageSize.width,
        imageSize.height,
      );
    }, [height, imageSize, width]);

    useEffect(() => {
      const stored = file ? getFileThumbnailDimensions(file) : null;
      if (stored) {
        if (uri) {
          putCachedImageDimensions(uri, stored);
        }
        setImageSize(current =>
          current &&
          current.width === stored.width &&
          current.height === stored.height
            ? current
            : stored,
        );
        return;
      }

      if (!shouldLoadImage || !uri) {
        return;
      }

      if (deferHeavyMediaWork) {
        return;
      }

      const cached = getCachedImageDimensions(uri);
      if (cached) {
        setImageSize(current =>
          current &&
          current.width === cached.width &&
          current.height === cached.height
            ? current
            : cached,
        );
        if (albumId) {
          persistThumbnailDimensions(albumId, photoId, cached);
        }
        return;
      }

      let cancelled = false;

      loadImageDimensions(uri).then(dimensions => {
        if (cancelled || !dimensions) {
          return;
        }
        setImageSize(current =>
          current &&
          current.width === dimensions.width &&
          current.height === dimensions.height
            ? current
            : dimensions,
        );
        if (albumId) {
          persistThumbnailDimensions(albumId, photoId, dimensions);
        }
      });

      return () => {
        cancelled = true;
      };
    }, [albumId, deferHeavyMediaWork, file, photoId, shouldLoadImage, uri]);

    const handleLoad = useCallback(
      (event: NativeSyntheticEvent<ImageLoadEventData>) => {
        setIsLoaded(true);

        const {width: loadedWidth, height: loadedHeight} =
          event.nativeEvent.source;
        if (loadedWidth <= 0 || loadedHeight <= 0) {
          return;
        }

        setImageSize(current => {
          if (current) {
            return current;
          }
          const dimensions = {width: loadedWidth, height: loadedHeight};
          putCachedImageDimensions(uri, dimensions);
          if (albumId) {
            persistThumbnailDimensions(albumId, photoId, dimensions);
          }
          return dimensions;
        });
      },
      [albumId, photoId, uri],
    );

    return (
      <View
        style={[
          styles.itemContainer,
          {width, height, backgroundColor: colors.cardBackgroundSecondary},
        ]}>
        {uri && (shouldLoadImage || isLoaded) ? (
          <Image
            source={{uri}}
            onLoad={handleLoad}
            onError={() => setIsLoaded(true)}
            style={[
              styles.containedImage,
              imageLayout
                ? {
                    width: imageLayout.width,
                    height: imageLayout.height,
                    left: imageLayout.left,
                    top: imageLayout.top,
                    opacity: isLoaded ? 1 : 0,
                  }
                : {
                    width,
                    height,
                    left: 0,
                    top: 0,
                    opacity: isLoaded ? 1 : 0,
                  },
            ]}
          />
        ) : null}
      </View>
    );
  },
  (prev, next) =>
    prev.albumId === next.albumId &&
    prev.photoId === next.photoId &&
    prev.width === next.width &&
    prev.height === next.height &&
    prev.deferHeavyMediaWork === next.deferHeavyMediaWork,
);

type PhotoGridCell = {
  key: string;
  photoId: string;
  index: number;
};

type PhotoGridRow = {
  key: string;
  rowIndex: number;
  cells: PhotoGridCell[];
};

type PhotoGridRowViewProps = {
  row: PhotoGridRow;
  albumId?: string;
  itemWidth: number;
  itemHeight: number;
  gap: number;
  deferHeavyMediaWork: boolean;
};

const PhotoGridRowView = memo(
  function PhotoGridRowView({
    row,
    albumId,
    itemWidth,
    itemHeight,
    gap,
    deferHeavyMediaWork,
  }: PhotoGridRowViewProps) {
    return (
      <View style={[styles.row, {marginBottom: gap, gap}]}>
        {row.cells.map(cell => (
          <PhotoGridCellImage
            key={cell.key}
            albumId={albumId}
            photoId={cell.photoId}
            width={itemWidth}
            height={itemHeight}
            deferHeavyMediaWork={deferHeavyMediaWork}
          />
        ))}
        {row.cells.length < COLUMNS &&
          Array.from({length: COLUMNS - row.cells.length}).map(
            (_, fillerIndex) => (
              <View
                key={`filler-${row.rowIndex}-${fillerIndex}`}
                style={{
                  width: itemWidth,
                  height: itemHeight,
                  backgroundColor: colors.cardBackgroundSecondary,
                }}
              />
            ),
          )}
      </View>
    );
  },
  (prev, next) =>
    prev.row === next.row &&
    prev.albumId === next.albumId &&
    prev.itemWidth === next.itemWidth &&
    prev.itemHeight === next.itemHeight &&
    prev.gap === next.gap &&
    prev.deferHeavyMediaWork === next.deferHeavyMediaWork,
);

export type PhotoGridProps = {
  items: AlbumGridFileItem[];
  albumId?: string;
  horizontalPadding?: number;
  gap?: number;
  deferHeavyMediaWork?: boolean;
};

export type PhotoGridHandle = {
  scrollToTop: () => void;
};

function buildRows(photoIds: string[]): PhotoGridRow[] {
  const rows: PhotoGridRow[] = [];

  for (let index = 0; index < photoIds.length; index += COLUMNS) {
    const rowPhotoIds = photoIds.slice(index, index + COLUMNS);
    const rowIndex = index / COLUMNS;
    rows.push({
      key: `row-${rowIndex}:${rowPhotoIds.join(',')}`,
      rowIndex,
      cells: rowPhotoIds.map((photoId, columnIndex) => ({
        key: photoId,
        photoId,
        index: index + columnIndex,
      })),
    });
  }

  return rows;
}

const viewabilityConfig = {
  itemVisiblePercentThreshold: 20,
};

export const PhotoGrid = forwardRef<PhotoGridHandle, PhotoGridProps>(
  function PhotoGrid(
    {
      items,
      albumId,
      horizontalPadding = HORIZONTAL_PADDING,
      gap = GAP,
      deferHeavyMediaWork = false,
    },
    ref,
  ) {
  const {width: windowWidth} = useWindowDimensions();
  const [settledLayoutWidth, setSettledLayoutWidth] = useState(0);
  const settledLayoutWidthRef = useRef(0);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listRef = useRef<FlatList<PhotoGridRow>>(null);
  const scrollOffsetRef = useRef(0);
  const scrollAnimationFrameRef = useRef<number | null>(null);
  const itemsRef = useRef(items);
  const albumIdRef = useRef(albumId);
  const deferHeavyMediaWorkRef = useRef(deferHeavyMediaWork);
  const lastPreloadRangeRef = useRef('');
  const lastHydrateRangeRef = useRef('');
  const lastThumbnailRangeRef = useRef('');
  const pendingViewableRef = useRef<{
    start: number;
    end: number;
    indices: number[];
  } | null>(null);
  const scrollSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isScrollingRef = useRef(false);
  const isProgrammaticScrollRef = useRef(false);
  const imageLoadStoreRef = useRef<ImageLoadStore | null>(null);
  if (imageLoadStoreRef.current == null) {
    imageLoadStoreRef.current = createImageLoadStore();
  }
  const imageLoadStore = imageLoadStoreRef.current;

  itemsRef.current = items;
  albumIdRef.current = albumId;
  deferHeavyMediaWorkRef.current = deferHeavyMediaWork;

  const ignoreViewabilityUntilRef = useRef(0);

  const cancelScrollAnimation = useCallback(() => {
    if (scrollAnimationFrameRef.current != null) {
      cancelAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }
    isProgrammaticScrollRef.current = false;
  }, []);

  const scrollToTop = useCallback(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }

    if (scrollAnimationFrameRef.current != null) {
      cancelAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }

    const startOffset = scrollOffsetRef.current;
    if (startOffset <= 0) {
      return;
    }

    isProgrammaticScrollRef.current = true;
    isScrollingRef.current = true;
    // Programmatic flight would otherwise hydrate/load every window we pass.
    ignoreViewabilityUntilRef.current =
      Date.now() + SCROLL_TO_TOP_DURATION_MS + SCROLL_SETTLE_MS;

    const startTime = Date.now();

    const finish = () => {
      list.scrollToOffset({offset: 0, animated: false});
      scrollOffsetRef.current = 0;
      scrollAnimationFrameRef.current = null;
      isProgrammaticScrollRef.current = false;
      ignoreViewabilityUntilRef.current = 0;
      isScrollingRef.current = false;
    };

    const step = () => {
      if (!isProgrammaticScrollRef.current) {
        scrollAnimationFrameRef.current = null;
        return;
      }

      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / SCROLL_TO_TOP_DURATION_MS);
      const nextOffset = startOffset * (1 - easeOutCubic(progress));

      list.scrollToOffset({offset: nextOffset, animated: false});
      scrollOffsetRef.current = nextOffset;

      if (progress < 1) {
        scrollAnimationFrameRef.current = requestAnimationFrame(step);
        return;
      }

      finish();
    };

    scrollAnimationFrameRef.current = requestAnimationFrame(step);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      scrollToTop,
    }),
    [scrollToTop],
  );

  useEffect(() => {
    return () => {
      cancelScrollImagePreload();
      cancelScrollAnimation();
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
      }
      if (scrollSettleTimerRef.current) {
        clearTimeout(scrollSettleTimerRef.current);
      }
    };
  }, [cancelScrollAnimation]);

  const applyVisibleRange = useCallback(
    (start: number, end: number, indices: number[]) => {
      const currentItems = itemsRef.current;
      const currentAlbumId = albumIdRef.current;

      if (currentAlbumId) {
        const hydrateKey = `${start}:${end}`;
        if (lastHydrateRangeRef.current !== hydrateKey) {
          lastHydrateRangeRef.current = hydrateKey;
          scheduleHydrateVisiblePhotos(
            currentAlbumId,
            indices,
            SCROLL_GRID_VISIBLE_PADDING,
          );
        }

        const thumbnailKey = `${start}:${end}`;
        if (
          !deferHeavyMediaWorkRef.current &&
          lastThumbnailRangeRef.current !== thumbnailKey
        ) {
          lastThumbnailRangeRef.current = thumbnailKey;
          const photoIdsNeedingThumbnail = currentItems
            .slice(start, end)
            .filter(item => !isUsableThumbnailUri(item.file.thumbnailUri))
            .map(item => item.photoId);
          if (photoIdsNeedingThumbnail.length > 0) {
            scheduleThumbnailBackfillForPhotos(
              currentAlbumId,
              photoIdsNeedingThumbnail,
            );
          }
        }
      }

      const rangeItems = currentItems.slice(start, end);
      const nextLoadIds = new Set(imageLoadStore.getIds());
      for (const item of rangeItems) {
        nextLoadIds.add(item.photoId);
      }
      imageLoadStore.setIds(nextLoadIds);

      if (deferHeavyMediaWorkRef.current) {
        return;
      }

      const preloadKey = `${start}:${end}`;
      if (lastPreloadRangeRef.current === preloadKey) {
        return;
      }
      lastPreloadRangeRef.current = preloadKey;
      scheduleScrollImagePreload(rangeItems.map(item => item.file));
    },
    [imageLoadStore],
  );

  const flushPendingVisibleRange = useCallback(() => {
    const pending = pendingViewableRef.current;
    if (!pending) {
      return;
    }
    pendingViewableRef.current = null;
    applyVisibleRange(pending.start, pending.end, pending.indices);
  }, [applyVisibleRange]);

  const markScrollIdle = useCallback(() => {
    scrollSettleTimerRef.current = null;
    isScrollingRef.current = false;
    flushPendingVisibleRange();
  }, [flushPendingVisibleRange]);

  useEffect(() => {
    if (deferHeavyMediaWork) {
      return;
    }
    flushPendingVisibleRange();
  }, [deferHeavyMediaWork, flushPendingVisibleRange]);

  const markScrolling = useCallback(() => {
    cancelScrollAnimation();
    isScrollingRef.current = true;
    if (scrollSettleTimerRef.current) {
      clearTimeout(scrollSettleTimerRef.current);
    }
    scrollSettleTimerRef.current = setTimeout(markScrollIdle, SCROLL_SETTLE_MS);
  }, [cancelScrollAnimation, markScrollIdle]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextOffset = event.nativeEvent.contentOffset.y;
      const delta = Math.abs(nextOffset - scrollOffsetRef.current);
      scrollOffsetRef.current = nextOffset;
      if (isProgrammaticScrollRef.current) {
        return;
      }
      if (delta < 1 && !isScrollingRef.current) {
        return;
      }
      markScrolling();
    },
    [markScrolling],
  );

  const handleScrollBeginDrag = useCallback(() => {
    ignoreViewabilityUntilRef.current = 0;
    markScrolling();
  }, [markScrolling]);

  const handleContainerLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width === settledLayoutWidthRef.current) {
      return;
    }

    if (resizeTimerRef.current) {
      clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = null;
    }

    if (settledLayoutWidthRef.current === 0) {
      settledLayoutWidthRef.current = width;
      setSettledLayoutWidth(width);
      return;
    }

    resizeTimerRef.current = setTimeout(() => {
      settledLayoutWidthRef.current = width;
      setSettledLayoutWidth(width);
      resizeTimerRef.current = null;
    }, RESIZE_SETTLE_MS);
  }, []);

  const effectiveWidth =
    settledLayoutWidth > 0 ? settledLayoutWidth : windowWidth;
  const containerWidth = effectiveWidth - horizontalPadding * 2;
  const itemWidth =
    containerWidth > 0
      ? (containerWidth - gap * (COLUMNS - 1)) / COLUMNS
      : 0;
  const itemHeight = itemWidth / ASPECT_RATIO;
  const rowHeight = itemHeight + gap;
  const settledItemWidth = Math.round(itemWidth);

  const photoIdsKey = items.map(item => item.photoId).join('\0');
  const rows = useMemo(
    () => buildRows(photoIdsKey ? photoIdsKey.split('\0') : []),
    [photoIdsKey],
  );

  useEffect(() => {
    const existingIds = imageLoadStore.getIds();
    if (existingIds.size > 0) {
      return;
    }

    const initialIds = new Set(
      itemsRef.current
        .slice(0, COLUMNS * PLACEHOLDER_INITIAL_ROWS)
        .map(item => item.photoId),
    );
    imageLoadStore.setIds(initialIds);
  }, [imageLoadStore, photoIdsKey]);

  const handleViewableItemsChanged = useCallback(
    ({viewableItems}: {viewableItems: ViewToken<PhotoGridRow>[]}) => {
      const indices = viewableItems.flatMap(
        token =>
          (token.item as PhotoGridRow | undefined)?.cells.map(
            cell => cell.index,
          ) ?? [],
      );

      if (indices.length === 0) {
        return;
      }

      if (Date.now() < ignoreViewabilityUntilRef.current) {
        return;
      }

      const currentItems = itemsRef.current;
      const minIndex = Math.min(...indices);
      const maxIndex = Math.max(...indices);
      const {start, end} = getScrollPreloadRange(
        minIndex,
        maxIndex,
        currentItems.length,
        COLUMNS,
      );

      // Hold new image loads until scroll settles only while analysis is
      // saturating the JS/native threads. After that, fling should paint.
      if (deferHeavyMediaWorkRef.current && isScrollingRef.current) {
        pendingViewableRef.current = {start, end, indices};
        return;
      }

      applyVisibleRange(start, end, indices);
    },
    [applyVisibleRange],
  );

  const onViewableItemsChangedRef = useRef(handleViewableItemsChanged);
  onViewableItemsChangedRef.current = handleViewableItemsChanged;

  const viewabilityConfigCallbackPairs = useRef([
    {
      viewabilityConfig,
      onViewableItemsChanged: (info: {
        viewableItems: ViewToken<PhotoGridRow>[];
      }) => onViewableItemsChangedRef.current(info),
    },
  ]).current;

  const renderRow = useCallback(
    ({item: row}: ListRenderItemInfo<PhotoGridRow>) => (
      <PhotoGridRowView
        row={row}
        albumId={albumId}
        itemWidth={itemWidth}
        itemHeight={itemHeight}
        gap={gap}
        deferHeavyMediaWork={deferHeavyMediaWork}
      />
    ),
    [albumId, deferHeavyMediaWork, gap, itemHeight, itemWidth],
  );

  const keyExtractor = useCallback((row: PhotoGridRow) => row.key, []);

  const getItemLayout = useCallback(
    (_data: ArrayLike<PhotoGridRow> | null | undefined, index: number) => ({
      length: rowHeight,
      offset: rowHeight * index,
      index,
    }),
    [rowHeight],
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.container} onLayout={handleContainerLayout}>
      {itemWidth > 0 ? (
        <PhotoGridImageLoadContext.Provider value={imageLoadStore}>
          <FlatList
            ref={listRef}
            data={rows}
            renderItem={renderRow}
            keyExtractor={keyExtractor}
            getItemLayout={getItemLayout}
            extraData={settledItemWidth}
            windowSize={
              deferHeavyMediaWork || Platform.OS === 'windows' ? 3 : 7
            }
            removeClippedSubviews={false}
            initialNumToRender={PLACEHOLDER_INITIAL_ROWS}
            maxToRenderPerBatch={deferHeavyMediaWork ? 3 : 6}
            updateCellsBatchingPeriod={GRAY_FILL_BATCH_PERIOD_MS}
            showsVerticalScrollIndicator
            onScroll={handleScroll}
            onScrollBeginDrag={handleScrollBeginDrag}
            scrollEventThrottle={16}
            contentContainerStyle={[
              styles.listContent,
              {paddingHorizontal: horizontalPadding},
            ]}
            viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs}
          />
        </PhotoGridImageLoadContext.Provider>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 16,
  },
  row: {
    flexDirection: 'row',
  },
  itemContainer: {
    overflow: 'hidden',
  },
  containedImage: {
    position: 'absolute',
  },
});
