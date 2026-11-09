import {colors} from '@lib/ui/colors';
import {fonts, interSemiBoldStyle, sansSemiBoldStyle} from '@lib/ui/typography';
import {Pressable} from '@components/ui';
import type {Ref} from 'react';
import {StyleSheet, Text, View} from 'react-native';

type AlbumLookStatusProps = {
  lookLabel: string;
  onChange: () => void;
  changeRef?: Ref<View>;
  disabled?: boolean;
};

const AUTO_APPLY_TEXT = 'Auto-applies to new photos';
// 19 high row + 13 + 13 = 45 point target without growing the row.
const HIT_SLOP = {top: 13, bottom: 13, left: 8, right: 8};

export function AlbumLookStatus({
  lookLabel,
  onChange,
  changeRef,
  disabled = false,
}: AlbumLookStatusProps) {
  return (
    <View style={styles.outerRow} testID="album-look-status">
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
        {...{ref: changeRef}}
        onPress={onChange}
        disabled={disabled}
        accessibilityState={{disabled}}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel="Change album look">
        <Text style={styles.change}>Change</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  outerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    rowGap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    ...sansSemiBoldStyle,
    fontSize: 14,
    color: colors.white,
  },
  muted: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: '#D1D1D1',
  },
  change: {
    ...interSemiBoldStyle,
    fontSize: 14,
    color: colors.accent,
  },
});
