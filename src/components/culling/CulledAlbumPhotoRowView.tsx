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

export const GRID_GAP = 16;

type CulledAlbumPhotoRowViewProps = Omit<
  CulledAlbumPhotoCardProps,
  'photoId' | 'similarShotCount'
> & {
  row: PhotoGridRow;
  getSimilarShotCount?: (photoId: string) => number | undefined;
};

export const CulledAlbumPhotoRowView = memo(
  function CulledAlbumPhotoRowView({
    row,
    albumId,
    cardWidth,
    canDeletePhoto,
    isMobileLayout,
    deferHeavyMediaWork,
    getSimilarShotCount,
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
            similarShotCount={getSimilarShotCount?.(cell.photoId)}
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
    prev.getSimilarShotCount === next.getSimilarShotCount,
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
});
