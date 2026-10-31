import {SimilarShotsBadge} from '@components/culling/SimilarShotsBadge';
import {Pressable} from '@components/ui';
import {colors} from '@lib/ui/colors';
import {StyleSheet} from 'react-native';
import IconTrash from '../../assets/images/icon_trash.svg';

type CulledAlbumPhotoCardOverlayProps = {
  photoId: string;
  fileName: string;
  showDeleteButton: boolean;
  similarShotCount?: number;
  onDeletePress: (photoId: string, fileName: string) => void;
  onOpenDetail: () => void;
};

export function CulledAlbumPhotoCardOverlay({
  photoId,
  fileName,
  showDeleteButton,
  similarShotCount,
  onDeletePress,
  onOpenDetail,
}: CulledAlbumPhotoCardOverlayProps) {
  return (
    <>
      {showDeleteButton && (
        <Pressable
          style={styles.deletePhotoButton}
          onPress={event => {
            event.stopPropagation();
            onDeletePress(photoId, fileName);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${fileName}`}>
          <IconTrash width={24} height={24} color={colors.text} />
        </Pressable>
      )}
      {similarShotCount != null && (
        <SimilarShotsBadge count={similarShotCount} onPress={onOpenDetail} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  deletePhotoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 36,
    backgroundColor: colors.background + '66',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
