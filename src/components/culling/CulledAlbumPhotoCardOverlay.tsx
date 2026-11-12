import {PhotoAiBadges} from '@components/culling/PhotoAiBadges';
import {Pressable} from '@components/ui';
import type {CulledAlbumPhoto} from '@lib/culledAlbum/types';
import {colors} from '@lib/ui/colors';
import {Image, StyleSheet} from 'react-native';

const TRASH_IMAGE = require('../../assets/images/icon_trash_512.png');

type CulledAlbumPhotoCardOverlayProps = {
  photoId: string;
  photo: CulledAlbumPhoto;
  showDeleteButton: boolean;
  similarShotCount?: number;
  onDeletePress: (photoId: string, fileName: string) => void;
  onOpenDetail: () => void;
};

export function CulledAlbumPhotoCardOverlay({
  photoId,
  photo,
  showDeleteButton,
  similarShotCount,
  onDeletePress,
  onOpenDetail,
}: CulledAlbumPhotoCardOverlayProps) {
  const fileName = photo.file?.name ?? '';
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
          <Image
            source={TRASH_IMAGE}
            style={styles.trashIcon}
            resizeMode="contain"
          />
        </Pressable>
      )}
      <PhotoAiBadges
        flags={photo}
        similarShotCount={similarShotCount}
        onOpenDetail={onOpenDetail}
      />
    </>
  );
}

const styles = StyleSheet.create({
  deletePhotoButton: {
    position: 'absolute',
    top: 12,
    right: 11.67,
    width: 36,
    height: 36,
    borderRadius: 100,
    backgroundColor: colors.background + '66',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trashIcon: {
    width: 24,
    height: 24,
    tintColor: colors.text,
  },
});
