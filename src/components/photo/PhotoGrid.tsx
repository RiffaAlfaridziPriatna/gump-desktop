import {scheduleHydrateVisiblePhotos} from '@hooks/useVisiblePhotos';
import type {AlbumGridFileItem} from '@lib/culledAlbum/stableAlbumGridFiles';
import {
  scheduleResolveExistingThumbnails,
  scheduleThumbnailBackfillForPhotos,
} from '@lib/culledAlbum/thumbnailBackfill';
import {getContainedImageLayout} from '@lib/culling/cullingFaceCrop';
import {
  getCachedImageDimensions,
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
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  FlatList,
  Image,
  type ImageLoadEventData,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  ListRenderItemInfo,
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
const SCROLL_TO_TOP_DURATION_MS = 450;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

const PhotoGridCellImage = memo(
  function PhotoGridCellImage({
    uri,
    width,
    height,
  }: {
    uri: string;
    width: number;
    height: number;
  }) {
    const [isLoaded, setIsLoaded] = useState(false);
    const [imageSize, setImageSize] = useState<ImageDimensions | null>(
      () => (uri ? getCachedImageDimensions(uri) ?? null : null),
    );

    useEffect(() => {
      setIsLoaded(false);
      setImageSize(uri ? getCachedImageDimensions(uri) ?? null : null);
    }, [uri]);

    const imageLayout = useMemo(() => {
      if (!imageSize) {
        return null;
      }

      return getContainedImageLayout(
        width,
        height,
        imageSize.width,
        imageSize.height,
      );
    }, [height, imageSize, width]);

    useEffect(() => {
      if (!uri) {
        return;
      }

      const cached = getCachedImageDimensions(uri);
      if (cached) {
        setImageSize(cached);
        return;
      }

      let cancelled = false;

      loadImageDimensions(uri).then(dimensions => {
        if (!cancelled && dimensions) {
          setImageSize(dimensions);
        }
      });

      return () => {
        cancelled = true;
      };
    }, [uri]);

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
          return dimensions;
        });
      },
      [uri],
    );

    return (
      <View
        style={[
          styles.itemContainer,
          {width, height, backgroundColor: colors.cardBackgroundSecondary},
        ]}>
        {uri ? (
          imageLayout ? (
            <Image
              source={{uri}}
              onLoad={handleLoad}
              onError={() => setIsLoaded(true)}
              style={[
                styles.containedImage,
                {
                  width: imageLayout.width,
                  height: imageLayout.height,
                  left: imageLayout.left,
                  top: imageLayout.top,
                  opacity: isLoaded ? 1 : 0,
                },
              ]}
            />
          ) : (
            <Image
              source={{uri}}
              onLoad={handleLoad}
              onError={() => setIsLoaded(true)}
              style={styles.imageHidden}
            />
          )
        ) : null}
      </View>
    );
  },
  (prev, next) =>
    prev.uri === next.uri &&
    prev.width === next.width &&
    prev.height === next.height,
);

type PhotoGridCell = {
  key: string;
  uri: string;
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
  itemWidth: number;
  itemHeight: number;
  gap: number;
};

const PhotoGridRowView = memo(
  function PhotoGridRowView({
    row,
    itemWidth,
    itemHeight,
    gap,
  }: PhotoGridRowViewProps) {
    return (
      <View style={[styles.row, {marginBottom: gap, gap}]}>
        {row.cells.map(cell => (
          <PhotoGridCellImage
            key={cell.key}
            uri={cell.uri}
            width={itemWidth}
            height={itemHeight}
          />
        ))}
        {row.cells.length < COLUMNS &&
          Array.from({length: COLUMNS - row.cells.length}).map(
            (_, fillerIndex) => (
              <View
                key={`filler-${row.rowIndex}-${fillerIndex}`}
                style={{width: itemWidth, height: itemHeight}}
              />
            ),
          )}
      </View>
    );
  },
  (prev, next) =>
    prev.row === next.row &&
    prev.itemWidth === next.itemWidth &&
    prev.itemHeight === next.itemHeight &&
    prev.gap === next.gap,
);

export type PhotoGridProps = {
  items: AlbumGridFileItem[];
  albumId?: string;
  horizontalPadding?: number;
  gap?: number;
};

export type PhotoGridHandle = {
  scrollToTop: () => void;
};

function buildRows(items: AlbumGridFileItem[]): PhotoGridRow[] {
  const rows: PhotoGridRow[] = [];

  for (let index = 0; index < items.length; index += COLUMNS) {
    const rowItems = items.slice(index, index + COLUMNS);
    const rowIndex = index / COLUMNS;
    rows.push({
      key: `row-${rowIndex}`,
      rowIndex,
      cells: rowItems.map((item, columnIndex) => {
        const cellIndex = index + columnIndex;
        const uri = resolveGridDisplayUri(item.file) ?? '';
        return {
          key: `${item.photoId}:${uri}`,
          uri,
          photoId: item.photoId,
          index: cellIndex,
        };
      }),
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
  const lastPreloadRangeRef = useRef('');
  const lastHydrateRangeRef = useRef('');
  const lastThumbnailRangeRef = useRef('');

  itemsRef.current = items;
  albumIdRef.current = albumId;

  const cancelScrollAnimation = useCallback(() => {
    if (scrollAnimationFrameRef.current != null) {
      cancelAnimationFrame(scrollAnimationFrameRef.current);
      scrollAnimationFrameRef.current = null;
    }
  }, []);

  const scrollToTopSmooth = useCallback(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }

    cancelScrollAnimation();

    const startOffset = scrollOffsetRef.current;
    if (startOffset <= 0) {
      return;
    }

    const startTime = Date.now();

    const step = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(1, elapsed / SCROLL_TO_TOP_DURATION_MS);
      const nextOffset = startOffset * (1 - easeOutCubic(progress));

      list.scrollToOffset({offset: nextOffset, animated: false});
      scrollOffsetRef.current = nextOffset;

      if (progress < 1) {
        scrollAnimationFrameRef.current = requestAnimationFrame(step);
        return;
      }

      list.scrollToOffset({offset: 0, animated: false});
      scrollOffsetRef.current = 0;
      scrollAnimationFrameRef.current = null;
    };

    scrollAnimationFrameRef.current = requestAnimationFrame(step);
  }, [cancelScrollAnimation]);

  useImperativeHandle(
    ref,
    () => ({
      scrollToTop: scrollToTopSmooth,
    }),
    [scrollToTopSmooth],
  );

  useEffect(() => {
    return () => {
      cancelScrollImagePreload();
      cancelScrollAnimation();
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
      }
    };
  }, [cancelScrollAnimation]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
    },
    [],
  );

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

  const rows = useMemo(() => buildRows(items), [items]);

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

      const currentItems = itemsRef.current;
      const minIndex = Math.min(...indices);
      const maxIndex = Math.max(...indices);
      const {start, end} = getScrollPreloadRange(
        minIndex,
        maxIndex,
        currentItems.length,
        COLUMNS,
      );

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
        if (lastThumbnailRangeRef.current !== thumbnailKey) {
          lastThumbnailRangeRef.current = thumbnailKey;
          const photoIdsNeedingThumbnail = currentItems
            .slice(start, end)
            .filter(item => !isUsableThumbnailUri(item.file.thumbnailUri))
            .map(item => item.photoId);
          if (photoIdsNeedingThumbnail.length > 0) {
            scheduleResolveExistingThumbnails(
              currentAlbumId,
              photoIdsNeedingThumbnail,
            );
            scheduleThumbnailBackfillForPhotos(
              currentAlbumId,
              photoIdsNeedingThumbnail,
            );
          }
        }
      }

      const preloadKey = `${start}:${end}`;
      if (lastPreloadRangeRef.current === preloadKey) {
        return;
      }
      lastPreloadRangeRef.current = preloadKey;

      const files = currentItems.slice(start, end).map(item => item.file);
      scheduleScrollImagePreload(files);
    },
    [],
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
        itemWidth={itemWidth}
        itemHeight={itemHeight}
        gap={gap}
      />
    ),
    [gap, itemHeight, itemWidth],
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
        <FlatList
          ref={listRef}
          data={rows}
          renderItem={renderRow}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          extraData={settledItemWidth}
          windowSize={3}
          removeClippedSubviews
          initialNumToRender={4}
          maxToRenderPerBatch={2}
          updateCellsBatchingPeriod={150}
          showsVerticalScrollIndicator
          onScroll={handleScroll}
          scrollEventThrottle={16}
          contentContainerStyle={[
            styles.listContent,
            {paddingHorizontal: horizontalPadding},
          ]}
          viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs}
        />
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
  imageHidden: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
  },
});
