import { ContainedLookImage } from '@components/look/ContainedLookImage';
import { LookCompareToggle } from '@components/look/LookCompareToggle';
import {
  LookImportErrorBanner,
  type LookImportFailure,
} from '@components/look/LookImportErrorBanner';
import { LookPickerTiles } from '@components/look/LookPickerTiles';
import { focusDesktopNode } from '@components/modals/focusDesktopNode';
import { getLookLabel, LOOK_CATALOG } from '@lib/look/lookCatalog';
import { hasAppliedLook, type CustomLook, type LookId } from '@lib/look/types';
import { colors } from '@lib/ui/colors';
import { fonts, sansSemiBoldStyle } from '@lib/ui/typography';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

type LookPickerBodyProps = {
  visible: boolean;
  previewUri: string;
  currentLookId: LookId;
  selectedLookId: LookId;
  showAfter: boolean;
  customLook?: CustomLook | null;
  importError?: LookImportFailure | null;
  onUploadPreset?: () => void;
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
  customLook,
  importError,
  onUploadPreset,
  onSelectLook,
  onShowAfterChange,
}: LookPickerBodyProps) {
  const tileRefs = useRef<Record<string, View | null>>({});
  const pendingFocusRef = useRef(false);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0 });

  const openFocusedRef = useRef<string | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const currentRef = useRef(currentLookId);
  currentRef.current = currentLookId;

  const customName = customLook?.name;
  const hasCustom = customLook != null;
  const lookIds = useMemo<LookId[]>(
    () => [
      ...LOOK_CATALOG.map(look => look.id),
      ...(hasCustom ? ['custom' as const] : []),
    ],
    [hasCustom],
  );

  const handlePreviewLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setPreviewSize(current =>
      current.width === width && current.height === height
        ? current
        : { width, height },
    );
  }, []);

  // The ui Modal mounts its content one commit after `visible` flips, so focus
  // from the tile ref callback too, once the current tile exists.
  const focusCurrentTile = useCallback(() => {
    const node = tileRefs.current[currentRef.current];
    if (
      openFocusedRef.current === currentRef.current ||
      !visibleRef.current ||
      !node
    ) {
      return;
    }
    openFocusedRef.current = currentRef.current;
    focusDesktopNode(node);
  }, []);

  useEffect(() => {
    if (visible) {
      focusCurrentTile();
    } else {
      openFocusedRef.current = null;
    }
  }, [visible, currentLookId, focusCurrentTile]);

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
      const index = lookIds.indexOf(selectedLookId);
      const count = lookIds.length;
      pendingFocusRef.current = true;
      onSelectLook(lookIds[(index + step + count) % count]!);
    },
    [lookIds, onSelectLook, selectedLookId],
  );

  const handleTileRef = useCallback(
    (lookId: LookId, node: View | null) => {
      tileRefs.current[lookId] = node;
      if (node && lookId === currentRef.current) {
        focusCurrentTile();
      }
    },
    [focusCurrentTile],
  );

  const handleToggle = useCallback(
    (nextShowAfter: boolean) => {
      onShowAfterChange(nextShowAfter);
      AccessibilityInfo.announceForAccessibility(
        nextShowAfter
          ? `Showing after, ${getLookLabel(selectedLookId, customName)}`
          : 'Showing before, original photo',
      );
    },
    [onShowAfterChange, selectedLookId, customName],
  );

  return (
    <View style={styles.body}>
      <View style={styles.preview} onLayout={handlePreviewLayout}>
        <View
          style={StyleSheet.absoluteFill}
          accessible
          accessibilityRole="image"
          accessibilityLabel={
            showAfter && hasAppliedLook(selectedLookId)
              ? `Preview, ${getLookLabel(selectedLookId, customName)}`
              : 'Preview, original photo'
          }
        >
          {previewUri && previewSize.width > 0 && previewSize.height > 0 ? (
            <ContainedLookImage
              uri={previewUri}
              width={previewSize.width}
              height={previewSize.height}
              lookId={
                showAfter && hasAppliedLook(selectedLookId)
                  ? selectedLookId
                  : 'original'
              }
              isTransparent={false}
              borderRadius={0}
            />
          ) : null}
        </View>
        {hasAppliedLook(selectedLookId) ? (
          <View style={styles.toggle}>
            <LookCompareToggle showAfter={showAfter} onChange={handleToggle} />
          </View>
        ) : null}
      </View>
      <Text
        style={styles.caption}
        accessibilityElementsHidden
        importantForAccessibility="no"
      >
        {CAPTION}
      </Text>
      <LookPickerTiles
        previewUri={previewUri}
        currentLookId={currentLookId}
        selectedLookId={selectedLookId}
        customLook={customLook}
        groupLabel={CAPTION}
        onKeyDown={handleTilesKeyDown}
        keyDownEvents={arrowKeyDownEvents}
        onSelectLook={onSelectLook}
        onUploadPreset={onUploadPreset}
        onTileRef={handleTileRef}
      />
      <Text style={styles.note}>{NOTE}</Text>
      {importError ? (
        <LookImportErrorBanner
          key={importError.id}
          error={importError.reason}
        />
      ) : null}
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
    // Figma preview height; the picker is wider than 480 so no aspect ratio.
    height: 326,
    backgroundColor: colors.cardGrayLight,
    overflow: 'hidden',
  },
  toggle: {
    position: 'absolute',
    left: 16,
    bottom: 16,
  },
  caption: {
    ...sansSemiBoldStyle,
    fontSize: 14,
    lineHeight: 14 * 1.2,
    color: colors.textDark,
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
