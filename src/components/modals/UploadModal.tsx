import {Modal} from '@components/ui';
import {colors} from '@lib/ui/colors';
import {fonts} from '@lib/ui/typography';
import {pickImages} from '@lib/media/filePicker';
import {FileAsset} from '@services/upload/types';
import {TouchableOpacity} from '@components/ui';
import {StyleSheet, Text} from 'react-native';
import DecorativeAddPhoto from '../../assets/images/modal_decorative_add_photos.svg';
import IconPlus from '../../assets/images/icon_plus.svg';

type UploadModalProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (files: FileAsset[]) => void;
};

export function UploadModal({visible, onClose, onSelect}: UploadModalProps) {
  async function handlePickPhotos() {
    try {
      const files = await pickImages();
      if (files.length > 0) {
        onSelect(files);
      }
    } catch (error) {
      console.error('[UploadModal] Failed to pick images', error);
    }
  }

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      width={720}
      height={800}
      decorative={DecorativeAddPhoto}
      decorativeHeight={200}
      showCloseButton={false}
      contentStyle={styles.content}>
      <TouchableOpacity
        style={styles.plusButton}
        onPress={handlePickPhotos}
        activeOpacity={0.8}>
        <IconPlus width={32} height={32} color={colors.white} />
      </TouchableOpacity>
      <Text style={styles.label}>Add Photos</Text>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 36,
  },
  plusButton: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: fonts.serif,
    fontSize: 40,
    lineHeight: 40,
    letterSpacing: 0,
    color: colors.textDark,
    fontWeight: '700',
  },
});
