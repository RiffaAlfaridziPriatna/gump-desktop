import { LookPreviewImage } from '@components/look/LookPreviewImage';
import { Pressable } from '@components/ui';
import type { LookId } from '@lib/look/types';
import { colors } from '@lib/ui/colors';
import { fonts, sansBoldStyle } from '@lib/ui/typography';
import type { Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';

type LookPickerTileProps = {
  lookId: LookId;
  label: string;
  previewUri: string;
  selected: boolean;
  current: boolean;
  onSelect: (lookId: LookId) => void;
  focusRef?: Ref<View>;
};

export function LookPickerTile({
  lookId,
  label,
  previewUri,
  selected,
  current,
  onSelect,
  focusRef,
}: LookPickerTileProps) {
  return (
    <Pressable
      // The ui wrapper forwards unknown props; React 19 passes ref as a prop.
      {...{ ref: focusRef }}
      style={({ pressed }) => [
        styles.tile,
        selected && styles.tileSelected,
        pressed && styles.pressed,
      ]}
      onPress={() => onSelect(lookId)}
      focusable={selected}
      accessibilityRole="radio"
      accessibilityLabel={current ? `${label}, current look` : label}
      accessibilityState={{ selected }}
    >
      <View
        style={styles.image}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <LookPreviewImage
          uri={previewUri}
          lookId={lookId}
          style={styles.photo}
        />
      </View>
      <Text style={[styles.label, selected && styles.labelSelected]}>
        {current ? `${label} · Current` : label}
      </Text>
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
  // Figma selected tile: accent at 10% opacity.
  tileSelected: {
    backgroundColor: 'rgba(255,150,50,0.1)',
    borderColor: colors.accent,
  },
  image: {
    alignSelf: 'stretch',
    aspectRatio: 171 / 114,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.cardGrayLight,
  },
  photo: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  label: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textDark,
    textAlign: 'center',
  },
  // No SemiBold font is registered; Bold is the closest.
  labelSelected: {
    ...sansBoldStyle,
  },
  pressed: {
    opacity: 0.8,
  },
});
