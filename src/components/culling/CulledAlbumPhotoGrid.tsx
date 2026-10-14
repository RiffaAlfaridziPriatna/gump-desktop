import {
  CulledAlbumPhotoHoverContext,
  createCulledAlbumPhotoHoverStore,
} from '@lib/culledAlbum/photoHover';
import {flushPendingThumbnailDimensions} from '@lib/culledAlbum/persistThumbnailDimensions';
import {getPhotoById} from '@lib/culledAlbum/store';
import {
  scheduleThumbnailBackfillForPhotos,
} from '@lib/culledAlbum/thumbnailBackfill';
import {scheduleHydratePhotoIds} from '@hooks/useVisiblePhotos';
import {
  cancelScrollImagePreload,
  getScrollPreloadRange,
  scheduleScrollImagePreload,
  SCROLL_GRID_VISIBLE_PADDING,
} from '@lib/media/scrollImagePreload';
import {isUsableThumbnailUri} from '@lib/storage/localStorage';
import type {LookId} from '@lib/look/types';
import {APIResponse} from '@services/api';
import {
  CulledAlbumPhotoCard,
  CulledAlbumPhotoCardProps,
} from '@components/culling/CulledAlbumPhotoCard';
import {
  CulledAlbumImageLoadContext,
  createCulledAlbumImageLoadStore,
  type CulledAlbumImageLoadStore,
} from '@components/culling/culledAlbumImageLoad';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  memo,
} from 'react';
import {
  FlatList,
  ListRenderItemInfo,
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  ViewToken,
} from 'react-native';

export type CulledAlbumGridPhoto = {
  photoId: string;
  analysis?: APIResponse.CullingPhoto;
  lookId?: LookId | null;
  lookIntensity?: number | null;
  disabled: boolean;
};

type CulledAlbumPhotoGridProps = {
  photos: CulledAlbumGridPhoto[];
  albumId: string;
  containerWidth: number;
  isMobileLayout: boolean;
  canDeletePhoto: boolean;
  hoverEnabled?: boolean;
  /**
   * When true (local import / analyze), shrink FlatList window and skip
   * heavy media side-work so scroll stays interactive.
   */
  deferHeavyMediaWork?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  onOpenDetail: CulledAlbumPhotoCardProps['onOpenDetail'];
  onToggleSelection: CulledAlbumPhotoCardProps['onToggleSelection'];
  onDeletePress: CulledAlbumPhotoCardProps['onDeletePress'];
  onStarPress: CulledAlbumPhotoCardProps['onStarPress'];
  onScrollInteractionStart?: () => void;
};

const COLUMNS = 3;
const THUMBNAIL_ASPECT_RATIO = 3 / 2;
const GRID_GAP = 16;
const CARD_INTERNAL_GAP = 8;
const CARD_INFO_ROW_HEIGHT = 28;
const VISIBLE_PADDING = SCROLL_GRID_VISIBLE_PADDING;
const SCROLL_END_DELAY_MS = 150;
const SCROLLBAR_GUTTER = 24;

type ImageLoadStore = CulledAlbumImageLoadStore;

const IDLE_IMAGE_LOAD_SEED = 24;
/** Idle gate pad while not scrolling — stay ahead of FlatList window. */
const IDLE_IMAGE_LOAD_PAD_ROWS = 2;
/** Busy gate pad: tight admission after scroll settles. */
const BUSY_IMAGE_LOAD_PAD_ROWS = 1;
/** Above this, shrink idle FlatList window (heavy interactive cards). */
const LARGE_ALBUM_PHOTO_THRESHOLD = 120;

type GridListItem = {
  photoId: string;
  index: number;
};

type GridRow = {
  key: string;
  rowIndex: number;
  cells: GridListItem[];
};

type CulledAlbumPhotoRowViewProps = {
  row: GridRow;
  albumId: string;
  cardWidth: number;
  canDeletePhoto: boolean;
  isMobileLayout: boolean;
  deferHeavyMediaWork: boolean;
  onOpenDetail: CulledAlbumPhotoCardProps['onOpenDetail'];
  onToggleSelection: CulledAlbumPhotoCardProps['onToggleSelection'];
  onDeletePress: CulledAlbumPhotoCardProps['onDeletePress'];
  onStarPress: CulledAlbumPhotoCardProps['onStarPress'];
};

const CulledAlbumPhotoRowView = memo(
  function CulledAlbumPhotoRowView({
    row,
    albumId,
    cardWidth,
    canDeletePhoto,
    isMobileLayout,
    deferHeavyMediaWork,
    onOpenDetail,
    onToggleSelection,
    onDeletePress,
    onStarPress,
  }: CulledAlbumPhotoRowViewProps) {
    return (
      <View style={[styles.row, {marginBottom: GRID_GAP, gap: GRID_GAP}]}>
        {row.cells.map(cell => (
          <CulledAlbumPhotoCard
            key={cell.photoId}
            albumId={albumId}
            photoId={cell.photoId}
            cardWidth={cardWidth}
            canDeletePhoto={canDeletePhoto}
            isMobileLayout={isMobileLayout}
            deferHeavyMediaWork={deferHeavyMediaWork}
            onOpenDetail={onOpenDetail}
            onToggleSelection={onToggleSelection}
            onDeletePress={onDeletePress}
            onStarPress={onStarPress}
          />
        ))}
        {row.cells.length < COLUMNS &&
          Array.from({length: COLUMNS - row.cells.length}).map((_, fillerIndex) => (
            <View
              key={`filler-${row.rowIndex}-${fillerIndex}`}
              style={{width: cardWidth}}
            />
          ))}
      </View>
    );
  },
  (prev, next) =>
    prev.row === next.row &&
    prev.albumId === next.albumId &&
    prev.cardWidth === next.cardWidth &&
    prev.canDeletePhoto === next.canDeletePhoto &&
    prev.isMobileLayout === next.isMobileLayout &&
    prev.deferHeavyMediaWork === next.deferHeavyMediaWork,
);

function buildRows(photoIds: string[]): GridRow[] {
  const rows: GridRow[] = [];

  for (let index = 0; index < photoIds.length; index += COLUMNS) {
    const rowPhotoIds = photoIds.slice(index, index + COLUMNS);
    const rowIndex = index / COLUMNS;
    rows.push({
      key: `row-${rowIndex}:${rowPhotoIds.join(',')}`,
      rowIndex,
      cells: rowPhotoIds.map((photoId, columnIndex) => ({
        photoId,
        index: index + columnIndex,
      })),
    });
  }

  return rows;
}

function photoIdsNeedingThumbnail(
  albumId: string,
  photoIds: string[],
): string[] {
  return photoIds.filter(photoId => {
    const photo = getPhotoById(albumId, photoId);
    return photo != null && !isUsableThumbnailUri(photo.file.thumbnailUri);
  });
}

export function CulledAlbumPhotoGrid({
  photos,
  albumId,
  containerWidth,
  isMobileLayout,
  canDeletePhoto,
  hoverEnabled = true,
  deferHeavyMediaWork = false,
  contentContainerStyle,
  onOpenDetail,
  onToggleSelection,
  onDeletePress,
  onStarPress,
  onScrollInteractionStart,
}: CulledAlbumPhotoGridProps) {
  const hoverStoreRef = useRef(createCulledAlbumPhotoHoverStore());
  const listRef = useRef<FlatList<GridRow>>(null);
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScrollActiveRef = useRef(false);
  const onScrollInteractionStartRef = useRef(onScrollInteractionStart);
  const lastPreloadRangeRef = useRef('');
  const lastHydrateRangeRef = useRef('');
  const lastThumbnailRangeRef = useRef('');
  const pendingViewableRef = useRef<{
    start: number;
    end: number;
    indices: number[];
  } | null>(null);
  const deferHeavyMediaWorkRef = useRef(deferHeavyMediaWork);
  deferHeavyMediaWorkRef.current = deferHeavyMediaWork;

  const photoIdsKey = photos.map(photo => photo.photoId).join('\0');
  const photoIds = useMemo(
    () => (photoIdsKey ? photoIdsKey.split('\0') : []),
    [photoIdsKey],
  );
  const photoIdsRef = useRef(photoIds);
  photoIdsRef.current = photoIds;

  const imageLoadStoreRef = useRef<ImageLoadStore | null>(null);
  if (!imageLoadStoreRef.current) {
    imageLoadStoreRef.current = createCulledAlbumImageLoadStore(
      photoIds.slice(0, IDLE_IMAGE_LOAD_SEED),
    );
  }
  const imageLoadStore = imageLoadStoreRef.current;

  onScrollInteractionStartRef.current = onScrollInteractionStart;

  useEffect(() => {
    hoverStoreRef.current.setEnabled(hoverEnabled);
  }, [hoverEnabled]);

  const gridWidth =
    containerWidth > 0
      ? Math.max(
          0,
          containerWidth - (isMobileLayout ? 0 : SCROLLBAR_GUTTER),
        )
      : 0;
  const cardWidth =
    gridWidth > GRID_GAP * (COLUMNS - 1)
      ? (gridWidth - GRID_GAP * (COLUMNS - 1)) / COLUMNS
      : 0;

  const lastGoodCardWidthRef = useRef(cardWidth);
  if (cardWidth > 0) {
    lastGoodCardWidthRef.current = cardWidth;
  }
  const renderCardWidth =
    cardWidth > 0 ? cardWidth : lastGoodCardWidthRef.current;
  const thumbnailHeight = renderCardWidth / THUMBNAIL_ASPECT_RATIO;
  const itemHeight =
    thumbnailHeight + CARD_INTERNAL_GAP + CARD_INFO_ROW_HEIGHT;
  const rowHeight = itemHeight + GRID_GAP;

  const rows = useMemo(() => buildRows(photoIds), [photoIds]);

  const prevPhotoIdsKeyRef = useRef(photoIdsKey);
  useEffect(() => {
    if (prevPhotoIdsKeyRef.current === photoIdsKey) {
      return;
    }
    prevPhotoIdsKeyRef.current = photoIdsKey;
    lastPreloadRangeRef.current = '';
    lastHydrateRangeRef.current = '';
    lastThumbnailRangeRef.current = '';
    pendingViewableRef.current = null;

    // Soft-reset image admission for the new filter set without remounting list.
    imageLoadStore.setIds(new Set(photoIds.slice(0, IDLE_IMAGE_LOAD_SEED)));

    // Safe scroll reset — empty FlatList can throw on scrollToOffset.
    if (photoIds.length > 0) {
      listRef.current?.scrollToOffset({offset: 0, animated: false});
    }
  }, [imageLoadStore, photoIds, photoIdsKey]);

  const getItemLayout = useCallback(
    (_data: ArrayLike<GridRow> | null | undefined, index: number) => ({
      length: rowHeight,
      offset: rowHeight * index,
      index,
    }),
    [rowHeight],
  );

  const clearScrollEndTimer = useCallback(() => {
    if (scrollEndTimerRef.current) {
      clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = null;
    }
  }, []);

  const admitImagesForRange = useCallback(
    (start: number, end: number, padRows: number) => {
      const currentPhotoIds = photoIdsRef.current;
      const padCells = padRows * COLUMNS;
      const admitStart = Math.max(0, start - padCells);
      const admitEnd = Math.min(currentPhotoIds.length, end + padCells + 1);
      const nextLoadIds = new Set(imageLoadStore.getIds());
      for (let i = admitStart; i < admitEnd; i++) {
        const id = currentPhotoIds[i];
        if (id) {
          nextLoadIds.add(id);
        }
      }
      imageLoadStore.setIds(nextLoadIds);
    },
    [imageLoadStore],
  );

  const applyVisibleRange = useCallback(
    (start: number, end: number, indices: number[], options?: {heavy?: boolean}) => {
      const heavy = options?.heavy !== false;
      const currentPhotoIds = photoIdsRef.current;
      const deferring = deferHeavyMediaWorkRef.current;
      const padRows = deferring
        ? BUSY_IMAGE_LOAD_PAD_ROWS
        : IDLE_IMAGE_LOAD_PAD_ROWS;

      // Always keep the image gate moving so cells paint during scroll.
      admitImagesForRange(start, end, padRows);

      if (!heavy || deferring) {
        return;
      }

      const {start: paddedStart, end: paddedEnd} = getScrollPreloadRange(
        start,
        end,
        currentPhotoIds.length,
        COLUMNS,
      );
      const rangeKey = `${paddedStart}:${paddedEnd}`;
      const rangePhotoIds = currentPhotoIds.slice(paddedStart, paddedEnd);

      // Hydrate the filtered-list band (not full-album indices).
      const hydrateStart = Math.max(0, Math.min(...indices) - VISIBLE_PADDING);
      const hydrateEnd = Math.min(
        currentPhotoIds.length,
        Math.max(...indices) + VISIBLE_PADDING + 1,
      );
      const hydrateIds = currentPhotoIds.slice(hydrateStart, hydrateEnd);
      if (lastHydrateRangeRef.current !== rangeKey) {
        lastHydrateRangeRef.current = rangeKey;
        scheduleHydratePhotoIds(albumId, hydrateIds);
      }

      if (lastThumbnailRangeRef.current !== rangeKey) {
        lastThumbnailRangeRef.current = rangeKey;
        const missingThumbnailIds = photoIdsNeedingThumbnail(
          albumId,
          rangePhotoIds,
        );
        if (missingThumbnailIds.length > 0) {
          scheduleThumbnailBackfillForPhotos(albumId, missingThumbnailIds);
        }
      }

      if (lastPreloadRangeRef.current === rangeKey) {
        return;
      }
      lastPreloadRangeRef.current = rangeKey;

      const files = rangePhotoIds
        .map(photoId => getPhotoById(albumId, photoId)?.file)
        .filter((file): file is NonNullable<typeof file> => Boolean(file));
      scheduleScrollImagePreload(files);
    },
    [admitImagesForRange, albumId],
  );

  const flushPendingVisibleRange = useCallback(() => {
    const pending = pendingViewableRef.current;
    if (!pending) {
      return;
    }
    pendingViewableRef.current = null;
    applyVisibleRange(pending.start, pending.end, pending.indices, {
      heavy: true,
    });
  }, [applyVisibleRange]);

  const scheduleScrollEnd = useCallback(() => {
    clearScrollEndTimer();
    scrollEndTimerRef.current = setTimeout(() => {
      hoverStoreRef.current.setScrolling(false);
      isScrollActiveRef.current = false;
      scrollEndTimerRef.current = null;
      flushPendingThumbnailDimensions();
      flushPendingVisibleRange();
    }, SCROLL_END_DELAY_MS);
  }, [clearScrollEndTimer, flushPendingVisibleRange]);

  useEffect(() => {
    return () => {
      cancelScrollImagePreload();
      clearScrollEndTimer();
      flushPendingThumbnailDimensions();
    };
  }, [clearScrollEndTimer]);

  useEffect(() => {
    if (deferHeavyMediaWork) {
      return;
    }
    flushPendingVisibleRange();
  }, [deferHeavyMediaWork, flushPendingVisibleRange]);

  const beginScrollInteraction = useCallback(() => {
    if (!isScrollActiveRef.current) {
      isScrollActiveRef.current = true;
      onScrollInteractionStartRef.current?.();
      hoverStoreRef.current.setScrolling(true);
    }
  }, []);

  const handleScrollBegin = useCallback(() => {
    beginScrollInteraction();
    clearScrollEndTimer();
  }, [beginScrollInteraction, clearScrollEndTimer]);

  const handleScrollEnd = useCallback(() => {
    scheduleScrollEnd();
  }, [scheduleScrollEnd]);

  const handleScroll = useCallback(() => {
    beginScrollInteraction();
    scheduleScrollEnd();
  }, [beginScrollInteraction, scheduleScrollEnd]);

  const handleViewableItemsChanged = useCallback(
    ({viewableItems}: {viewableItems: ViewToken<GridRow>[]}) => {
      const indices = viewableItems.flatMap(
        token => token.item?.cells.map(cell => cell.index) ?? [],
      );

      if (indices.length === 0) {
        return;
      }

      const minIndex = Math.min(...indices);
      const maxIndex = Math.max(...indices);

      // Match PhotoGrid: on macOS (and while analysis saturates JS), hold image
      // admission until scroll settles. Mid-scroll decode storms are what make
      // heavy cull cards feel far worse than AlbumDetail's image-only cells.
      if (
        isScrollActiveRef.current &&
        (deferHeavyMediaWorkRef.current || Platform.OS === 'macos')
      ) {
        pendingViewableRef.current = {
          start: minIndex,
          end: maxIndex,
          indices,
        };
        return;
      }

      if (isScrollActiveRef.current) {
        pendingViewableRef.current = {
          start: minIndex,
          end: maxIndex,
          indices,
        };
        applyVisibleRange(minIndex, maxIndex, indices, {heavy: false});
        return;
      }

      applyVisibleRange(minIndex, maxIndex, indices, {heavy: true});
    },
    [applyVisibleRange],
  );

  const onViewableItemsChangedRef = useRef(handleViewableItemsChanged);
  onViewableItemsChangedRef.current = handleViewableItemsChanged;

  const viewabilityConfigCallbackPairs = useRef([
    {
      viewabilityConfig: {
        itemVisiblePercentThreshold: 20,
      },
      onViewableItemsChanged: (info: {viewableItems: ViewToken<GridRow>[]}) =>
        onViewableItemsChangedRef.current(info),
    },
  ]).current;

  const renderRow = useCallback(
    ({item: row}: ListRenderItemInfo<GridRow>) => (
      <CulledAlbumPhotoRowView
        row={row}
        albumId={albumId}
        cardWidth={renderCardWidth}
        canDeletePhoto={canDeletePhoto}
        isMobileLayout={isMobileLayout}
        deferHeavyMediaWork={deferHeavyMediaWork}
        onOpenDetail={onOpenDetail}
        onToggleSelection={onToggleSelection}
        onDeletePress={onDeletePress}
        onStarPress={onStarPress}
      />
    ),
    [
      albumId,
      canDeletePhoto,
      deferHeavyMediaWork,
      renderCardWidth,
      isMobileLayout,
      onDeletePress,
      onOpenDetail,
      onStarPress,
      onToggleSelection,
    ],
  );

  const isLargeAlbum = photoIds.length >= LARGE_ALBUM_PHOTO_THRESHOLD;
  const windowSize = deferHeavyMediaWork
    ? 3
    : Platform.OS === 'windows'
      ? 3
      : isLargeAlbum
        ? 4
        : 7;
  const maxToRenderPerBatch = deferHeavyMediaWork || isLargeAlbum ? 3 : 6;
  const updateCellsBatchingPeriod =
    deferHeavyMediaWork || isLargeAlbum ? 100 : 50;

  if (photos.length === 0) {
    return null;
  }

  if (renderCardWidth <= 0) {
    return <View style={styles.list} />;
  }

  return (
    <CulledAlbumPhotoHoverContext.Provider value={hoverStoreRef.current}>
      <CulledAlbumImageLoadContext.Provider value={imageLoadStore}>
        <FlatList
          ref={listRef}
          data={rows}
          keyExtractor={item => item.key}
          renderItem={renderRow}
          getItemLayout={getItemLayout}
          contentContainerStyle={contentContainerStyle}
          style={styles.list}
          initialNumToRender={6}
          maxToRenderPerBatch={maxToRenderPerBatch}
          windowSize={windowSize}
          updateCellsBatchingPeriod={updateCellsBatchingPeriod}
          removeClippedSubviews={false}
          showsVerticalScrollIndicator
          onScroll={handleScroll}
          onScrollBeginDrag={handleScrollBegin}
          onScrollEndDrag={handleScrollEnd}
          onMomentumScrollEnd={handleScrollEnd}
          scrollEventThrottle={16}
          viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs}
        />
      </CulledAlbumImageLoadContext.Provider>
    </CulledAlbumPhotoHoverContext.Provider>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
  },
});
