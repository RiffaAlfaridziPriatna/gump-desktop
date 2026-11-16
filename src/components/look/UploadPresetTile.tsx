import { Pressable } from '@components/ui';
import { colors } from '@lib/ui/colors';
import { fonts } from '@lib/ui/typography';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type UploadPresetTileProps = {
  onPress?: () => void;
};

const LABEL = 'Upload preset';

export function UploadPresetTile({ onPress }: UploadPresetTileProps) {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        focused && styles.tileFocused,
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      disabled={!onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={LABEL}
    >
      <View
        style={styles.image}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={styles.plus}>+</Text>
      </View>
      <Text style={styles.label}>{LABEL}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    paddingTop: 4,
    paddingHorizontal: 4,
    paddingBottom: 6,
    gap: 6,
    alignItems: 'center',
  },
  // Same accent border as the selected LookPickerTile.
  tileFocused: {
    borderColor: colors.accent,
  },
  image: {
    alignSelf: 'stretch',
    aspectRatio: 171 / 114,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderLight,
    borderRadius: 4,
    backgroundColor: colors.cardGrayPlaceholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: {
    fontFamily: fonts.sans,
    fontSize: 28,
    lineHeight: 37,
    color: colors.textMuted,
    textAlign: 'center',
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textDark,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
});
