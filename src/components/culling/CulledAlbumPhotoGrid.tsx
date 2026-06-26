import {
  CulledAlbumPhotoHoverContext,
  createCulledAlbumPhotoHoverStore,
} from '@lib/culledAlbumPhotoHover';
import {useCulledAlbumThumbnailDimensions} from '@hooks/useCulledAlbumThumbnailDimensions';
import {
  buildCulledAlbumGridRows,
  CulledAlbumGridRow,
} from '@lib/culledAlbumGridLayout';
import {APIResponse} from '@services/api';
import {FileAsset} from '@services/upload/types';
import {CulledAlbumPhotoRow} from '@components/culling/CulledAlbumPhotoRow';
import {CulledAlbumPhotoCardProps} from '@components/culling/CulledAlbumPhotoCard';
import {useCallback, useMemo, useRef} from 'react';
import {
  FlatList,
  ListRenderItem,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';

export type CulledAlbumGridPhoto = {
  photoId: string;
  file: FileAsset;
  analysis?: APIResponse.CullingPhoto;
  disabled: boolean;
};

type CulledAlbumPhotoGridProps = {
  photos: CulledAlbumGridPhoto[];
  cardWidth: number;
  columnCount: number;
  gap: number;
  itemHeight: number;
  rowHeight: number;
  isMobileLayout: boolean;
  canDeletePhoto: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  onOpenDetail: CulledAlbumPhotoCardProps['onOpenDetail'];
  onToggleSelection: CulledAlbumPhotoCardProps['onToggleSelection'];
  onDeletePress: CulledAlbumPhotoCardProps['onDeletePress'];
  onStarPress: CulledAlbumPhotoCardProps['onStarPress'];
};

const SCROLL_END_DELAY_MS = 150;

export function CulledAlbumPhotoGrid({
  photos,
  cardWidth,
  columnCount,
  gap,
  itemHeight,
  rowHeight,
  isMobileLayout,
  canDeletePhoto,
  contentContainerStyle,
  onOpenDetail,
  onToggleSelection,
  onDeletePress,
  onStarPress,
}: CulledAlbumPhotoGridProps) {
  const hoverStoreRef = useRef(createCulledAlbumPhotoHoverStore());
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const thumbnailUriKey = useMemo(
    () => photos.map(photo => photo.file.uri).join('\0'),
    [photos],
  );
  const thumbnailDimensions =
    useCulledAlbumThumbnailDimensions(thumbnailUriKey);

  const rows = useMemo(
    () => buildCulledAlbumGridRows(photos, columnCount),
    [columnCount, photos],
  );

  const getItemLayout = useCallback(
    (
      _data: ArrayLike<CulledAlbumGridRow<CulledAlbumGridPhoto>> | null | undefined,
      index: number,
    ) => ({
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
      scrollEndTimerRef.current = null;
    }, SCROLL_END_DELAY_MS);
  }, [clearScrollEndTimer]);

  const handleScrollBegin = useCallback(() => {
    hoverStoreRef.current.setScrolling(true);
    clearScrollEndTimer();
  }, [clearScrollEndTimer]);

  const handleScroll = useCallback(
    (_event: NativeSyntheticEvent<NativeScrollEvent>) => {
      hoverStoreRef.current.setScrolling(true);
      scheduleScrollEnd();
    },
    [scheduleScrollEnd],
  );

  const handleScrollEnd = useCallback(() => {
    scheduleScrollEnd();
  }, [scheduleScrollEnd]);

  const renderRow: ListRenderItem<CulledAlbumGridRow<CulledAlbumGridPhoto>> =
    useCallback(
      ({item}) => (
        <CulledAlbumPhotoRow
          row={item}
          cardWidth={cardWidth}
          itemHeight={itemHeight}
          gap={gap}
          canDeletePhoto={canDeletePhoto}
          isMobileLayout={isMobileLayout}
          thumbnailDimensions={thumbnailDimensions}
          onOpenDetail={onOpenDetail}
          onToggleSelection={onToggleSelection}
          onDeletePress={onDeletePress}
          onStarPress={onStarPress}
        />
      ),
      [
        canDeletePhoto,
        cardWidth,
        gap,
        isMobileLayout,
        itemHeight,
        onDeletePress,
        onOpenDetail,
        onStarPress,
        onToggleSelection,
        thumbnailDimensions,
      ],
    );

  return (
    <CulledAlbumPhotoHoverContext.Provider value={hoverStoreRef.current}>
      <FlatList
        data={rows}
        keyExtractor={item => item.id}
        renderItem={renderRow}
        getItemLayout={getItemLayout}
        contentContainerStyle={contentContainerStyle}
        style={styles.list}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={5}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews={Platform.OS !== 'web'}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        onScrollBeginDrag={handleScrollBegin}
        onScrollEndDrag={handleScrollEnd}
        onMomentumScrollEnd={handleScrollEnd}
      />
    </CulledAlbumPhotoHoverContext.Provider>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
});
