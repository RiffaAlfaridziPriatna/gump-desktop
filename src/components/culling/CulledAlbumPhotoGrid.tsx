import {
  CulledAlbumPhotoHoverContext,
  createCulledAlbumPhotoHoverStore,
} from '@lib/culledAlbum/photoHover';
import {scheduleThumbnailBackfillForPhotos} from '@lib/culledAlbum/thumbnailBackfill';
import {scheduleHydrateVisiblePhotos} from '@hooks/useVisiblePhotos';
import {
  cancelScrollImagePreload,
  getScrollPreloadRange,
  scheduleScrollImagePreload,
  SCROLL_GRID_VISIBLE_PADDING,
} from '@lib/media/scrollImagePreload';
import {APIResponse} from '@services/api';
import {FileAsset} from '@services/upload/types';
import {
  CulledAlbumPhotoCard,
  CulledAlbumPhotoCardProps,
} from '@components/culling/CulledAlbumPhotoCard';
import {useCallback, useEffect, useMemo, useRef} from 'react';
import {
  FlatList,
  ListRenderItemInfo,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  ViewToken,
} from 'react-native';

export type CulledAlbumGridPhoto = {
  photoId: string;
  file: FileAsset;
  analysis?: APIResponse.CullingPhoto;
  disabled: boolean;
};

type CulledAlbumPhotoGridProps = {
  photos: CulledAlbumGridPhoto[];
  albumId: string;
  containerWidth: number;
  isMobileLayout: boolean;
  canDeletePhoto: boolean;
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

type GridListItem = CulledAlbumGridPhoto & {index: number};

type GridRow = {
  key: string;
  rowIndex: number;
  cells: GridListItem[];
};

function buildRows(items: GridListItem[]): GridRow[] {
  const rows: GridRow[] = [];

  for (let index = 0; index < items.length; index += COLUMNS) {
    const rowItems = items.slice(index, index + COLUMNS);
    const rowIndex = index / COLUMNS;
    rows.push({
      key: `row-${rowIndex}`,
      rowIndex,
      cells: rowItems,
    });
  }

  return rows;
}

export function CulledAlbumPhotoGrid({
  photos,
  albumId,
  containerWidth,
  isMobileLayout,
  canDeletePhoto,
  contentContainerStyle,
  onOpenDetail,
  onToggleSelection,
  onDeletePress,
  onStarPress,
  onScrollInteractionStart,
}: CulledAlbumPhotoGridProps) {
  const hoverStoreRef = useRef(createCulledAlbumPhotoHoverStore());
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isScrollActiveRef = useRef(false);
  const onScrollInteractionStartRef = useRef(onScrollInteractionStart);
  const lastPreloadRangeRef = useRef('');
  const lastHydrateRangeRef = useRef('');
  const lastThumbnailRangeRef = useRef('');

  onScrollInteractionStartRef.current = onScrollInteractionStart;

  const gridWidth =
    containerWidth > 0
      ? Math.max(
          0,
          containerWidth - (isMobileLayout ? 0 : SCROLLBAR_GUTTER),
        )
      : 0;
  const cardWidth =
    gridWidth > 0 ? (gridWidth - GRID_GAP * (COLUMNS - 1)) / COLUMNS : 0;
  const thumbnailHeight = cardWidth / THUMBNAIL_ASPECT_RATIO;
  const itemHeight =
    thumbnailHeight + CARD_INTERNAL_GAP + CARD_INFO_ROW_HEIGHT;
  const rowHeight = itemHeight + GRID_GAP;

  const listItems = useMemo(
    (): GridListItem[] =>
      photos.map((photo, index) => ({
        ...photo,
        index,
      })),
    [photos],
  );

  const rows = useMemo(() => buildRows(listItems), [listItems]);

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

  const scheduleScrollEnd = useCallback(() => {
    clearScrollEndTimer();
    scrollEndTimerRef.current = setTimeout(() => {
      hoverStoreRef.current.setScrolling(false);
      isScrollActiveRef.current = false;
      scrollEndTimerRef.current = null;
    }, SCROLL_END_DELAY_MS);
  }, [clearScrollEndTimer]);

  useEffect(() => {
    return () => {
      cancelScrollImagePreload();
      clearScrollEndTimer();
    };
  }, [clearScrollEndTimer]);

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

  const handleScroll = useCallback(() => {
    scheduleScrollEnd();
  }, [scheduleScrollEnd]);

  const handleScrollEnd = useCallback(() => {
    scheduleScrollEnd();
  }, [scheduleScrollEnd]);

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
      const {start, end} = getScrollPreloadRange(
        minIndex,
        maxIndex,
        listItems.length,
        COLUMNS,
      );
      const rangeKey = `${start}:${end}`;

      if (lastHydrateRangeRef.current !== rangeKey) {
        lastHydrateRangeRef.current = rangeKey;
        scheduleHydrateVisiblePhotos(albumId, indices, VISIBLE_PADDING);
      }

      if (lastThumbnailRangeRef.current !== rangeKey) {
        lastThumbnailRangeRef.current = rangeKey;
        const photoIdsNeedingThumbnail = listItems
          .slice(start, end)
          .filter(item => !item.file.thumbnailUri)
          .map(item => item.photoId);
        if (photoIdsNeedingThumbnail.length > 0) {
          scheduleThumbnailBackfillForPhotos(albumId, photoIdsNeedingThumbnail);
        }
      }

      if (lastPreloadRangeRef.current === rangeKey) {
        return;
      }
      lastPreloadRangeRef.current = rangeKey;

      const files = listItems.slice(start, end).map(item => item.file);
      scheduleScrollImagePreload(files);
    },
    [albumId, listItems],
  );

  const renderRow = useCallback(
    ({item: row}: ListRenderItemInfo<GridRow>) => (
      <View style={[styles.row, {marginBottom: GRID_GAP, gap: GRID_GAP}]}>
        {row.cells.map(cell => (
          <CulledAlbumPhotoCard
            key={cell.photoId}
            photoId={cell.photoId}
            file={cell.file}
            analysis={cell.analysis}
            cardWidth={cardWidth}
            canDeletePhoto={canDeletePhoto && !cell.disabled}
            disabled={cell.disabled}
            isMobileLayout={isMobileLayout}
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
    ),
    [
      canDeletePhoto,
      cardWidth,
      isMobileLayout,
      onDeletePress,
      onOpenDetail,
      onStarPress,
      onToggleSelection,
    ],
  );

  if (photos.length === 0 || cardWidth <= 0) {
    return null;
  }

  return (
    <CulledAlbumPhotoHoverContext.Provider value={hoverStoreRef.current}>
      <FlatList
        data={rows}
        keyExtractor={item => item.key}
        renderItem={renderRow}
        getItemLayout={getItemLayout}
        contentContainerStyle={contentContainerStyle}
        style={styles.list}
        initialNumToRender={4}
        maxToRenderPerBatch={2}
        windowSize={3}
        updateCellsBatchingPeriod={150}
        removeClippedSubviews
        showsVerticalScrollIndicator
        scrollEventThrottle={64}
        onScroll={handleScroll}
        onScrollBeginDrag={handleScrollBegin}
        onScrollEndDrag={handleScrollEnd}
        onMomentumScrollEnd={handleScrollEnd}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 20,
        }}
      />
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
