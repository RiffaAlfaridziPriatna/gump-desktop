import { ContainedLookImage } from '@components/look/ContainedLookImage';
import { Pressable } from '@components/ui';
import type { LookId } from '@lib/look/types';
import { colors } from '@lib/ui/colors';
import { fonts, sansSemiBoldStyle } from '@lib/ui/typography';
import { useCallback, useState, type Ref } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

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
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const handleImageLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setImageSize(prev =>
      prev.width === width && prev.height === height
        ? prev
        : { width, height },
    );
  }, []);

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
        onLayout={handleImageLayout}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {previewUri && imageSize.width > 0 && imageSize.height > 0 ? (
          <ContainedLookImage
            uri={previewUri}
            width={imageSize.width}
            height={imageSize.height}
            lookId={lookId}
            borderRadius={4}
          />
        ) : null}
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
  label: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textDark,
    textAlign: 'center',
  },
  labelSelected: {
    ...sansSemiBoldStyle,
  },
  pressed: {
    opacity: 0.8,
  },
});
