import { LookCompareToggle } from '@components/look/LookCompareToggle';
import { LookPickerTile } from '@components/look/LookPickerTile';
import { LookPreviewImage } from '@components/look/LookPreviewImage';
import { focusDesktopNode } from '@components/modals/focusDesktopNode';
import { getLookLabel, LOOK_CATALOG } from '@lib/look/lookCatalog';
import type { LookId } from '@lib/look/types';
import { colors } from '@lib/ui/colors';
import { fonts, sansBoldStyle } from '@lib/ui/typography';
import { useCallback, useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type LookPickerBodyProps = {
  visible: boolean;
  previewUri: string;
  currentLookId: LookId;
  selectedLookId: LookId;
  showAfter: boolean;
  onSelectLook: (lookId: LookId) => void;
  onShowAfterChange: (showAfter: boolean) => void;
};

const CAPTION = 'Choose a look for this album';
const NOTE = 'Applies to photos in this album and new photos added later.';
const HANDLED_BUBBLING = 3;
const ARROW_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] as const;

const arrowKeyDownEvents =
  Platform.OS === 'windows'
    ? ARROW_KEYS.map(code => ({ code, handledEventPhase: HANDLED_BUBBLING }))
    : ARROW_KEYS.map(key => ({ key }));

function arrowStep(name: string | undefined): number {
  if (name === 'ArrowRight' || name === 'ArrowDown') {
    return 1;
  }
  return name === 'ArrowLeft' || name === 'ArrowUp' ? -1 : 0;
}

export function LookPickerBody({
  visible,
  previewUri,
  currentLookId,
  selectedLookId,
  showAfter,
  onSelectLook,
  onShowAfterChange,
}: LookPickerBodyProps) {
  const tileRefs = useRef<Record<string, View | null>>({});
  const pendingFocusRef = useRef(false);

  useEffect(() => {
    if (visible) {
      focusDesktopNode(tileRefs.current[currentLookId] ?? null);
    }
  }, [visible, currentLookId]);

  useEffect(() => {
    if (pendingFocusRef.current) {
      pendingFocusRef.current = false;
      focusDesktopNode(tileRefs.current[selectedLookId] ?? null);
    }
  }, [selectedLookId]);

  const handleTilesKeyDown = useCallback(
    (event: unknown) => {
      const native = (
        event as { nativeEvent?: { key?: string; code?: string } }
      ).nativeEvent;
      const step = arrowStep(native?.key ?? native?.code);
      if (step === 0) {
        return;
      }
      const index = LOOK_CATALOG.findIndex(look => look.id === selectedLookId);
      const count = LOOK_CATALOG.length;
      pendingFocusRef.current = true;
      onSelectLook(LOOK_CATALOG[(index + step + count) % count]!.id);
    },
    [onSelectLook, selectedLookId],
  );

  const handleToggle = useCallback(
    (nextShowAfter: boolean) => {
      onShowAfterChange(nextShowAfter);
      AccessibilityInfo.announceForAccessibility(
        nextShowAfter
          ? `Showing after, ${getLookLabel(selectedLookId)}`
          : 'Showing before, original photo',
      );
    },
    [onShowAfterChange, selectedLookId],
  );

  return (
    <View style={styles.body}>
      <View style={styles.preview}>
        <View
          style={StyleSheet.absoluteFill}
          accessible
          accessibilityRole="image"
          accessibilityLabel={
            showAfter
              ? `Preview, ${getLookLabel(selectedLookId)}`
              : 'Preview, original photo'
          }
        >
          {previewUri ? (
            <LookPreviewImage
              uri={previewUri}
              lookId={showAfter ? selectedLookId : 'original'}
              style={styles.previewPhoto}
            />
          ) : null}
        </View>
        <View style={styles.toggle}>
          <LookCompareToggle showAfter={showAfter} onChange={handleToggle} />
        </View>
      </View>
      <Text
        style={styles.caption}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {CAPTION}
      </Text>
      <View
        style={styles.tiles}
        accessibilityRole="radiogroup"
        accessibilityLabel={CAPTION}
        onKeyDown={handleTilesKeyDown}
        keyDownEvents={arrowKeyDownEvents}
      >
        {LOOK_CATALOG.map(look => (
          <LookPickerTile
            key={look.id}
            lookId={look.id}
            label={look.label}
            previewUri={previewUri}
            selected={look.id === selectedLookId}
            current={look.id === currentLookId}
            onSelect={onSelectLook}
            focusRef={node => {
              tileRefs.current[look.id] = node;
            }}
          />
        ))}
      </View>
      <Text style={styles.note}>{NOTE}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    alignSelf: 'stretch',
    gap: 12,
    alignItems: 'flex-start',
  },
  preview: {
    alignSelf: 'stretch',
    aspectRatio: 312 / 212,
    backgroundColor: colors.cardGrayLight,
  },
  previewPhoto: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  toggle: {
    position: 'absolute',
    left: 16,
    bottom: 18,
  },
  caption: {
    ...sansBoldStyle,
    fontSize: 14,
    lineHeight: 14 * 1.2,
    color: colors.textDark,
  },
  tiles: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 8,
  },
  note: {
    alignSelf: 'stretch',
    paddingVertical: 8,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 14 * 1.2,
    color: colors.textDark,
    textAlign: 'center',
  },
});
