import {colors} from '@lib/ui/colors';
import {StyleSheet, View} from 'react-native';

const FRAME_OUTSET = 4;

/** Focus ring around a whole card; overlays the grid gap so layout never shifts. */
export function CulledAlbumPhotoFocusFrame() {
  return <View pointerEvents="none" style={styles.frame} />;
}

const styles = StyleSheet.create({
  frame: {
    position: 'absolute',
    top: -FRAME_OUTSET,
    right: -FRAME_OUTSET,
    bottom: -FRAME_OUTSET,
    left: -FRAME_OUTSET,
    borderWidth: 2,
    borderRadius: 8,
    borderColor: colors.blue,
  },
});
