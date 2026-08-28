import {
  CulledAlbumPhotoHoverContext,
  createCulledAlbumPhotoHoverStore,
} from '@lib/culledAlbum/photoHover';
import {getPhotoById} from '@lib/culledAlbum/store';
import {
  scheduleThumbnailBackfillForPhotos,
  scheduleResolveExistingThumbnails,
} from '@lib/culledAlbum/thumbnailBackfill';
import {scheduleHydrateVisiblePhotos} from '@hooks/useVisiblePhotos';
import {
  cancelScrollImagePreload,
  getScrollPreloadRange,
  scheduleScrollImagePreload,
  SCROLL_GRID_VISIBLE_PADDING,
} from '@lib/media/scrollImagePreload';
import {isUsableThumbnailUri} from '@lib/storage/localStorage';
import {APIResponse} from '@services/api';
import {
  CulledAlbumPhotoCard,
  CulledAlbumPhotoCardProps,
} from '@components/culling/CulledAlbumPhotoCard';
import {useCallback, useEffect, useMemo, useRef, memo} from 'react';
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
  disabled: boolean;
};

type CulledAlbumPhotoGridProps = {
  photos: CulledAlbumGridPhoto[];
  albumId: string;
  containerWidth: number;
  isMobileLayout: boolean;
  canDeletePhoto: boolean;
  cullingHasUploads: boolean;
  hoverEnabled?: boolean;
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
  cullingHasUploads: boolean;
  isMobileLayout: boolean;
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
    cullingHasUploads,
    isMobileLayout,
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
            cullingHasUploads={cullingHasUploads}
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
    );
  },
  (prev, next) =>
    prev.row === next.row &&
    prev.albumId === next.albumId &&
    prev.cardWidth === next.cardWidth &&
    prev.canDeletePhoto === next.canDeletePhoto &&
    prev.cullingHasUploads === next.cullingHasUploads &&
    prev.isMobileLayout === next.isMobileLayout,
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
  cullingHasUploads,
  hoverEnabled = true,
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
    gridWidth > 0 ? (gridWidth - GRID_GAP * (COLUMNS - 1)) / COLUMNS : 0;
  const thumbnailHeight = cardWidth / THUMBNAIL_ASPECT_RATIO;
  const itemHeight =
    thumbnailHeight + CARD_INTERNAL_GAP + CARD_INFO_ROW_HEIGHT;
  const rowHeight = itemHeight + GRID_GAP;

  const photoIdsKey = photos.map(photo => photo.photoId).join('\0');
  const photoIds = useMemo(
    () => (photoIdsKey ? photoIdsKey.split('\0') : []),
    [photoIdsKey],
  );
  const photoIdsRef = useRef(photoIds);
  photoIdsRef.current = photoIds;

  const rows = useMemo(() => buildRows(photoIds), [photoIds]);

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

  useEffect(() => {
    if (photoIds.length === 0) {
      return;
    }
    const initialIds = photoIds.slice(0, COLUMNS * 4);
    const missingThumbnailIds = photoIdsNeedingThumbnail(albumId, initialIds);
    if (missingThumbnailIds.length > 0) {
      scheduleResolveExistingThumbnails(albumId, missingThumbnailIds);
    }
  }, [albumId, photoIds]);

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

  const handleViewableItemsChanged = useCallback(
    ({viewableItems}: {viewableItems: ViewToken<GridRow>[]}) => {
      const currentPhotoIds = photoIdsRef.current;
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
        currentPhotoIds.length,
        COLUMNS,
      );
      const rangeKey = `${start}:${end}`;
      const rangePhotoIds = currentPhotoIds.slice(start, end);

      if (lastHydrateRangeRef.current !== rangeKey) {
        lastHydrateRangeRef.current = rangeKey;
        scheduleHydrateVisiblePhotos(albumId, indices, VISIBLE_PADDING);
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
    [albumId],
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
        cardWidth={cardWidth}
        canDeletePhoto={canDeletePhoto}
        cullingHasUploads={cullingHasUploads}
        isMobileLayout={isMobileLayout}
        onOpenDetail={onOpenDetail}
        onToggleSelection={onToggleSelection}
        onDeletePress={onDeletePress}
        onStarPress={onStarPress}
      />
    ),
    [
      albumId,
      canDeletePhoto,
      cardWidth,
      cullingHasUploads,
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
        initialNumToRender={6}
        maxToRenderPerBatch={2}
        windowSize={3}
        updateCellsBatchingPeriod={150}
        removeClippedSubviews={Platform.OS !== 'windows'}
        showsVerticalScrollIndicator
        onScrollBeginDrag={handleScrollBegin}
        onScrollEndDrag={handleScrollEnd}
        onMomentumScrollEnd={handleScrollEnd}
        viewabilityConfigCallbackPairs={viewabilityConfigCallbackPairs}
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
