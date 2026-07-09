import {Modal} from '@components/ui';
import {colors} from '@lib/ui/colors';
import {fonts} from '@lib/ui/typography';
import {pickImages} from '@lib/media/filePicker';
import {FileAsset} from '@services/upload/types';
import {useMemo} from 'react';
import {TouchableOpacity} from '@components/ui';
import {StyleSheet, Text, useWindowDimensions} from 'react-native';
import DecorativeAddPhoto from '../../assets/images/modal_decorative_add_photos.svg';
import IconPlus from '../../assets/images/icon_plus.svg';

const MODAL_PADDING = 48 * 2;
const DESIGN_WIDTH = 720;
const DESIGN_HEIGHT = 800;

type UploadModalProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (files: FileAsset[]) => void;
};

function useModalDimensions(windowWidth: number, windowHeight: number) {
  return useMemo(() => {
    const maxWidth = windowWidth - MODAL_PADDING;
    const maxHeight = windowHeight - MODAL_PADDING;
    const scale = Math.min(1, maxWidth / DESIGN_WIDTH, maxHeight / DESIGN_HEIGHT);

    return {
      maxWidth,
      maxHeight,
      width: DESIGN_WIDTH * scale,
      height: DESIGN_HEIGHT * scale,
    };
  }, [windowWidth, windowHeight]);
}

export function UploadModal({visible, onClose, onSelect}: UploadModalProps) {
  const {height: windowHeight, width: windowWidth} = useWindowDimensions();
  const {width: modalWidth, height: modalHeight} = useModalDimensions(
    windowWidth,
    windowHeight,
  );

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
      width={modalWidth}
      height={modalHeight}
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
    gap: 32,
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
