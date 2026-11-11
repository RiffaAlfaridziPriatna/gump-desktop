import {colors} from '@lib/ui/colors';
import {StyleSheet, View} from 'react-native';

/** Focus ring on the card's own bounds, so it never overlaps a neighbour. */
export function CulledAlbumPhotoFocusFrame() {
  return <View pointerEvents="none" style={styles.frame} />;
}

const styles = StyleSheet.create({
  frame: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderWidth: 2,
    borderRadius: 6,
    borderColor: colors.blue,
  },
});
