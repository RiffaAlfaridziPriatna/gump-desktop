import { TouchableOpacity } from '@components/ui';
import { colors } from '@lib/ui/colors';
import { StyleSheet, View } from 'react-native';
import IconPlus from '../../assets/images/icon_plus.svg';
import { GumpScrollToTopButton } from './GumpScrollToTopButton';

const FAB_SIZE = 48;

type AlbumDetailFabStackProps = {
  onScrollToTop: () => void;
  onAddPhotos: () => void;
  addDisabled?: boolean;
  hideAdd?: boolean;
  rightOffset?: number;
  bottomOffset?: number;
};

export function AlbumDetailFabStack({
  onScrollToTop,
  onAddPhotos,
  addDisabled = false,
  hideAdd = false,
  rightOffset = 28,
  bottomOffset = 8,
}: AlbumDetailFabStackProps) {
  return (
    <View
      style={[styles.stack, { right: rightOffset, bottom: bottomOffset }]}
      pointerEvents="box-none"
    >
      <GumpScrollToTopButton
        onPress={onScrollToTop}
        style={styles.scrollFab}
      />
      {hideAdd ? null : (
        <TouchableOpacity
          style={[styles.fab, styles.addFab, addDisabled && styles.fabDisabled]}
          onPress={onAddPhotos}
          disabled={addDisabled}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Add photos"
        >
          <IconPlus width={28} height={28} color={colors.white} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    position: 'absolute',
    zIndex: 100,
    gap: 8,
    alignItems: 'center',
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollFab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: 8,
    backgroundColor: colors.fabBackground,
  },
  addFab: {
    backgroundColor: colors.accent,
  },
  fabDisabled: {
    opacity: 0.2,
  },
});
