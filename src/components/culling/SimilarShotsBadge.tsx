import {Pressable} from '@components/ui';
import {colors} from '@lib/ui/colors';
import {interSemiBoldStyle} from '@lib/ui/typography';
import {StyleSheet, Text, View} from 'react-native';
import IconChevronRight from '../../assets/images/lucide_chevron_right.svg';
import IconLayers from '../../assets/images/lucide_layers.svg';

export const CHIP_BACKGROUND = 'rgba(19,20,21,0.75)';
export const CHIP_HEIGHT = 23;
export const CHIP_ICON_SIZE = 12;
/** lucide_layers glyph size inside a 12 box (Figma inset 8.33% plus stroke). */
export const CHIP_LAYERS_WIDTH = 10.6783;
export const CHIP_LAYERS_HEIGHT = 10.6692;

type SimilarShotsBadgeProps = {
  count: number;
  onPress: () => void;
};

/** Chip row pinned over the thumbnail; the card's own press stays untouched. */
export function SimilarShotsBadge({count, onPress}: SimilarShotsBadgeProps) {
  return (
    <View pointerEvents="box-none" style={styles.chipRow}>
      <Pressable
        style={styles.badge}
        onPress={event => {
          event.stopPropagation();
          onPress();
        }}
        accessibilityRole="button"
        focusable
        accessibilityLabel={`${count} similar shots, open viewer`}>
        <View style={styles.icon}>
          <IconLayers
            width={CHIP_LAYERS_WIDTH}
            height={CHIP_LAYERS_HEIGHT}
            color={colors.white}
          />
        </View>
        <Text style={styles.label}>{`${count} similar shots`}</Text>
        <IconChevronRight
          width={CHIP_ICON_SIZE}
          height={CHIP_ICON_SIZE}
          color={colors.white}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  badge: {
    height: CHIP_HEIGHT,
    paddingHorizontal: 8,
    borderRadius: 100,
    backgroundColor: CHIP_BACKGROUND,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  icon: {
    width: CHIP_ICON_SIZE,
    height: CHIP_ICON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...interSemiBoldStyle,
    color: colors.text,
    fontSize: 12,
  },
});
