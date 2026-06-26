import {
  CulledAlbumPhotoCard,
  CulledAlbumPhotoCardProps,
} from '@components/culling/CulledAlbumPhotoCard';
import {CulledAlbumGridPhoto} from '@components/culling/CulledAlbumPhotoGrid';
import {CulledAlbumGridRow} from '@lib/culledAlbumGridLayout';
import {ImageDimensions} from '@lib/imageDimensions';
import {memo} from 'react';
import {StyleSheet, View} from 'react-native';

export type CulledAlbumPhotoRowProps = {
  row: CulledAlbumGridRow<CulledAlbumGridPhoto>;
  cardWidth: number;
  itemHeight: number;
  gap: number;
  canDeletePhoto: boolean;
  isMobileLayout: boolean;
  thumbnailDimensions: Map<string, ImageDimensions>;
  onOpenDetail: CulledAlbumPhotoCardProps['onOpenDetail'];
  onToggleSelection: CulledAlbumPhotoCardProps['onToggleSelection'];
  onDeletePress: CulledAlbumPhotoCardProps['onDeletePress'];
  onStarPress: CulledAlbumPhotoCardProps['onStarPress'];
};

function CulledAlbumPhotoRowComponent({
  row,
  cardWidth,
  itemHeight,
  gap,
  canDeletePhoto,
  isMobileLayout,
  thumbnailDimensions,
  onOpenDetail,
  onToggleSelection,
  onDeletePress,
  onStarPress,
}: CulledAlbumPhotoRowProps) {
  return (
    <View style={[styles.row, {gap, height: itemHeight, marginBottom: gap}]}>
      {row.photos.map(photo => (
        <View
          key={photo.photoId}
          style={{width: cardWidth, height: itemHeight}}>
          <CulledAlbumPhotoCard
            photoId={photo.photoId}
            file={photo.file}
            analysis={photo.analysis}
            cardWidth={cardWidth}
            canDeletePhoto={canDeletePhoto && !photo.disabled}
            disabled={photo.disabled}
            isMobileLayout={isMobileLayout}
            imageSize={thumbnailDimensions.get(photo.file.uri)}
            usePreloadedDimensions
            onOpenDetail={onOpenDetail}
            onToggleSelection={onToggleSelection}
            onDeletePress={onDeletePress}
            onStarPress={onStarPress}
          />
        </View>
      ))}
    </View>
  );
}

function areRowsEqual(
  previous: CulledAlbumPhotoRowProps,
  next: CulledAlbumPhotoRowProps,
): boolean {
  if (
    previous.row.id !== next.row.id ||
    previous.cardWidth !== next.cardWidth ||
    previous.itemHeight !== next.itemHeight ||
    previous.gap !== next.gap ||
    previous.canDeletePhoto !== next.canDeletePhoto ||
    previous.isMobileLayout !== next.isMobileLayout ||
    previous.thumbnailDimensions !== next.thumbnailDimensions ||
    previous.onOpenDetail !== next.onOpenDetail ||
    previous.onToggleSelection !== next.onToggleSelection ||
    previous.onDeletePress !== next.onDeletePress ||
    previous.onStarPress !== next.onStarPress
  ) {
    return false;
  }

  if (previous.row.photos.length !== next.row.photos.length) {
    return false;
  }

  for (let index = 0; index < previous.row.photos.length; index += 1) {
    if (previous.row.photos[index] !== next.row.photos[index]) {
      return false;
    }
  }

  return true;
}

export const CulledAlbumPhotoRow = memo(
  CulledAlbumPhotoRowComponent,
  areRowsEqual,
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
});
