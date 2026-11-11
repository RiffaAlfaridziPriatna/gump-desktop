import {
  CulledAlbumPhotoCard,
  CulledAlbumPhotoCardProps,
} from '@components/culling/CulledAlbumPhotoCard';
import {
  GRID_COLUMNS,
  type PhotoGridRow,
} from '@components/culling/culledAlbumGridRows';
import {memo} from 'react';
import {StyleSheet, View} from 'react-native';

type CulledAlbumPhotoRowViewProps = Omit<
  CulledAlbumPhotoCardProps,
  'photoId' | 'similarShotCount' | 'isFocused'
> & {
  row: PhotoGridRow;
  focusedPhotoId?: string | null;
  getSimilarShotCount?: (photoId: string) => number | undefined;
};

function rowFocus(row: PhotoGridRow, focusedPhotoId?: string | null) {
  return row.cells.some(cell => cell.photoId === focusedPhotoId)
    ? focusedPhotoId
    : null;
}

export const CulledAlbumPhotoRowView = memo(
  function CulledAlbumPhotoRowView({
    row,
    albumId,
    cardWidth,
    canDeletePhoto,
    isMobileLayout,
    deferHeavyMediaWork,
    getSimilarShotCount,
    focusedPhotoId,
    onCardPress,
    onOpenDetail,
    onToggleSelection,
    onDeletePress,
    onStarPress,
  }: CulledAlbumPhotoRowViewProps) {
    return (
      <View style={styles.row}>
        {row.cells.map(cell => (
          <CulledAlbumPhotoCard
            key={cell.photoId}
            albumId={albumId}
            photoId={cell.photoId}
            cardWidth={cardWidth}
            canDeletePhoto={canDeletePhoto}
            isMobileLayout={isMobileLayout}
            deferHeavyMediaWork={deferHeavyMediaWork}
            similarShotCount={getSimilarShotCount?.(cell.photoId)}
            isFocused={cell.photoId === focusedPhotoId}
            onCardPress={onCardPress}
            onOpenDetail={onOpenDetail}
            onToggleSelection={onToggleSelection}
            onDeletePress={onDeletePress}
            onStarPress={onStarPress}
          />
        ))}
        {row.cells.length < GRID_COLUMNS &&
          Array.from({length: GRID_COLUMNS - row.cells.length}).map((_, fillerIndex) => (
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
    prev.deferHeavyMediaWork === next.deferHeavyMediaWork &&
    prev.getSimilarShotCount === next.getSimilarShotCount &&
    prev.onCardPress === next.onCardPress &&
    rowFocus(prev.row, prev.focusedPhotoId) ===
      rowFocus(next.row, next.focusedPhotoId),
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
});
