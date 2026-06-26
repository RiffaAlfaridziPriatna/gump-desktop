import {
  CulledAlbumPhotoCard,
  CulledAlbumPhotoCardProps,
} from '@components/culling/CulledAlbumPhotoCard';
import {
  buildCulledAlbumGridRows,
  CulledAlbumGridRow,
} from '@lib/culledAlbumGridLayout';
import {APIResponse} from '@services/api';
import {FileAsset} from '@services/upload/types';
import {useCallback, useMemo} from 'react';
import {
  FlatList,
  ListRenderItem,
  StyleProp,
  StyleSheet,
  View,
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
  hoveredPhotoId: string | null;
  contentContainerStyle?: StyleProp<ViewStyle>;
  onHoverIn: CulledAlbumPhotoCardProps['onHoverIn'];
  onHoverOut: CulledAlbumPhotoCardProps['onHoverOut'];
  onOpenDetail: CulledAlbumPhotoCardProps['onOpenDetail'];
  onToggleSelection: CulledAlbumPhotoCardProps['onToggleSelection'];
  onDeletePress: CulledAlbumPhotoCardProps['onDeletePress'];
  onStarPress: CulledAlbumPhotoCardProps['onStarPress'];
};

export function CulledAlbumPhotoGrid({
  photos,
  cardWidth,
  columnCount,
  gap,
  itemHeight,
  rowHeight,
  isMobileLayout,
  canDeletePhoto,
  hoveredPhotoId,
  contentContainerStyle,
  onHoverIn,
  onHoverOut,
  onOpenDetail,
  onToggleSelection,
  onDeletePress,
  onStarPress,
}: CulledAlbumPhotoGridProps) {
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

  const renderPhoto = useCallback(
    (item: CulledAlbumGridPhoto) => (
      <View key={item.photoId} style={{width: cardWidth, height: itemHeight}}>
        <CulledAlbumPhotoCard
          photoId={item.photoId}
          file={item.file}
          analysis={item.analysis}
          cardWidth={cardWidth}
          canDeletePhoto={canDeletePhoto && !item.disabled}
          disabled={item.disabled}
          isHovered={hoveredPhotoId === item.photoId}
          isMobileLayout={isMobileLayout}
          onHoverIn={onHoverIn}
          onHoverOut={onHoverOut}
          onOpenDetail={onOpenDetail}
          onToggleSelection={onToggleSelection}
          onDeletePress={onDeletePress}
          onStarPress={onStarPress}
        />
      </View>
    ),
    [
      canDeletePhoto,
      cardWidth,
      hoveredPhotoId,
      isMobileLayout,
      itemHeight,
      onDeletePress,
      onHoverIn,
      onHoverOut,
      onOpenDetail,
      onStarPress,
      onToggleSelection,
    ],
  );

  const renderRow: ListRenderItem<CulledAlbumGridRow<CulledAlbumGridPhoto>> =
    useCallback(
      ({item}) => (
        <View style={[styles.row, {gap, height: itemHeight, marginBottom: gap}]}>
          {item.photos.map(renderPhoto)}
        </View>
      ),
      [gap, itemHeight, renderPhoto],
    );

  return (
    <FlatList
      data={rows}
      keyExtractor={item => item.id}
      renderItem={renderRow}
      getItemLayout={getItemLayout}
      contentContainerStyle={contentContainerStyle}
      style={styles.list}
      initialNumToRender={4}
      maxToRenderPerBatch={4}
      windowSize={7}
      extraData={hoveredPhotoId}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
});
