import {Pressable} from '@components/ui';
import {colors} from '@lib/ui/colors';
import {sansBoldStyle} from '@lib/ui/typography';
import {StyleSheet, Text, View} from 'react-native';

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
        accessibilityLabel={`${count} similar shots, open viewer`}>
        <Text style={styles.label}>{`${count} similar shots ›`}</Text>
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
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: colors.background + '99',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...sansBoldStyle,
    color: colors.text,
    fontSize: 12,
  },
});
