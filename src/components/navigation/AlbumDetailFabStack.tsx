import { TouchableOpacity } from '@components/ui';
import { colors } from '@lib/ui/colors';
import { StyleSheet, View } from 'react-native';
import IconChevronUp from '../../assets/images/icon_chevron_up.svg';
import IconPlus from '../../assets/images/icon_plus.svg';

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
  rightOffset = 8,
  bottomOffset = 8,
}: AlbumDetailFabStackProps) {
  return (
    <View
      style={[styles.stack, { right: rightOffset, bottom: bottomOffset }]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        style={[styles.fab, styles.scrollFab]}
        onPress={onScrollToTop}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Scroll to top"
      >
        <IconChevronUp width={32} height={32} color={colors.white} />
      </TouchableOpacity>
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
    backgroundColor: colors.fabBackground,
  },
  addFab: {
    backgroundColor: colors.accent,
  },
  fabDisabled: {
    opacity: 0.2,
  },
});
