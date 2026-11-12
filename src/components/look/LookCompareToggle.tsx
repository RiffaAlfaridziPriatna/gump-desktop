import { Pressable } from '@components/ui';
import { colors } from '@lib/ui/colors';
import { fonts } from '@lib/ui/typography';
import { StyleSheet, Text, View } from 'react-native';

type LookCompareToggleProps = {
  showAfter: boolean;
  onChange: (showAfter: boolean) => void;
};

const SEGMENTS = [
  { after: false, label: 'Before' },
  { after: true, label: 'After' },
] as const;

export function LookCompareToggle({
  showAfter,
  onChange,
}: LookCompareToggleProps) {
  return (
    <View style={styles.row} accessibilityRole="tablist"
      accessibilityLabel="Compare before and after"
    >
      {SEGMENTS.map(segment => {
        const selected = segment.after === showAfter;
        return (
          <Pressable
            key={segment.label}
            style={({ pressed }) => [
              styles.segment,
              selected ? styles.segmentSelected : styles.segmentIdle,
              pressed && styles.pressed,
            ]}
            onPress={() => onChange(segment.after)}
            hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
            accessibilityRole="tab"
            accessibilityLabel={segment.label}
            accessibilityState={{ selected }}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.label,
                selected ? styles.labelSelected : styles.labelIdle,
              ]}
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    width: 140,
  },
  // Idle border is always on so width stays stable; selected uses a matching
  // border so "Before" does not wrap when unselected (border ate 2px before).
  segment: {
    width: 67,
    borderRadius: 24,
    paddingHorizontal: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentIdle: {
    paddingVertical: 3,
    borderColor: colors.white,
  },
  segmentSelected: {
    paddingVertical: 4,
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.white,
  },
  labelIdle: {
    lineHeight: 14 * 1.6,
  },
  labelSelected: {
    lineHeight: 14 * 1.4,
  },
  pressed: {
    opacity: 0.8,
  },
});
