import {colors} from '@lib/ui/colors';
import {fonts, sansBoldStyle} from '@lib/ui/typography';
import {Pressable} from '@components/ui';
import {StyleSheet, Text, View} from 'react-native';

type AlbumLookStatusProps = {
  lookLabel: string;
  onChange: () => void;
};

const AUTO_APPLY_TEXT = 'Auto-applies to new photos';
const HIT_SLOP = {top: 12, bottom: 12, left: 8, right: 8};

export function AlbumLookStatus({lookLabel, onChange}: AlbumLookStatusProps) {
  return (
    <View style={styles.row}>
      <View
        accessible
        accessibilityLabel={`Look: ${lookLabel}. ${AUTO_APPLY_TEXT}`}
        style={styles.row}>
        <Text style={styles.label}>Look: {lookLabel}</Text>
        <Text style={styles.muted}>·</Text>
        <Text style={styles.muted}>{AUTO_APPLY_TEXT}</Text>
      </View>
      <Text
        style={styles.muted}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        ·
      </Text>
      <Pressable
        onPress={onChange}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel="Change album look">
        <Text style={styles.change}>Change</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    ...sansBoldStyle,
    fontSize: 14,
    color: colors.white,
  },
  muted: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: '#D1D1D1',
  },
  change: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
});
