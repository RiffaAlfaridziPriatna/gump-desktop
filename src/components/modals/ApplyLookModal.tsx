import { LookCompareToggle } from '@components/look/LookCompareToggle';
import { LookPickerTile } from '@components/look/LookPickerTile';
import { LookPreviewImage } from '@components/look/LookPreviewImage';
import { Modal, Pressable } from '@components/ui';
import type { CulledAlbumPhoto } from '@lib/culledAlbum/types';
import { LOOK_CATALOG } from '@lib/look/lookCatalog';
import type { LookId } from '@lib/look/types';
import {
  isUsableDetailUri,
  isUsableThumbnailUri,
} from '@lib/storage/localStorage';
import { colors } from '@lib/ui/colors';
import { fonts, sansBoldStyle } from '@lib/ui/typography';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import IconClose from '../../assets/images/icon_close.svg';
import CircleBlue from '../../assets/images/upload/blue_circle.svg';
import HalfCircle from '../../assets/images/upload/half_circle.svg';
import CircleLightBlue from '../../assets/images/upload/light_blue_circle.svg';
import QuarterCircleOrange from '../../assets/images/upload/orange_quarter_circle.svg';
import QuarterCircleRed from '../../assets/images/upload/red_quarter_circle.svg';
import { focusDesktopNode } from './focusDesktopNode';

type ApplyLookModalProps = {
  visible: boolean;
  albumName: string;
  previewPhoto: CulledAlbumPhoto | undefined;
  currentLookId: LookId;
  onUseLook: (lookId: LookId) => void;
  onClose: () => void;
};

const TITLE = 'Edit Photos';
const CAPTION = 'Choose a look for this album';
const NOTE = 'Applies to photos in this album and new photos added later.';
// Figma GumpLight/Grey4; no matching token in colors.ts.
const SUBTITLE_COLOR = '#454545';
const HANDLED_BUBBLING = 3;

const escapeKeyDownEvents =
  Platform.OS === 'windows'
    ? [{ code: 'Escape', handledEventPhase: HANDLED_BUBBLING }]
    : [{ key: 'Escape' }];

/**
 * Oriented derivative for preview + LUT bake. Prefer the 1920 thumb over the
 * 4096 detail; never the album master on Windows (XAML Image skips EXIF).
 */
function resolvePreviewDisplayUri(photo: CulledAlbumPhoto | undefined): string {
  if (!photo) {
    return '';
  }
  if (isUsableThumbnailUri(photo.file.thumbnailUri)) {
    return photo.file.thumbnailUri!;
  }
  if (isUsableDetailUri(photo.file.detailUri)) {
    return photo.file.detailUri!;
  }
  return photo.file.uri || '';
}

function Decorations() {
  return (
    <View
      style={styles.decorations}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <QuarterCircleRed style={styles.quarterRedDecor} width={80} height={80} />
      <CircleBlue style={styles.circleBlueDecor} width={32} height={32} />
      <HalfCircle style={styles.halfCircleDecor} width={72} />
      <QuarterCircleOrange
        style={styles.quarterOrangeDecor}
        width={98}
        height={98}
      />
      <CircleLightBlue
        style={styles.circleLightBlueDecor}
        width={36}
        height={36}
      />
    </View>
  );
}

export function ApplyLookModal({
  visible,
  albumName,
  previewPhoto,
  currentLookId,
  onUseLook,
  onClose,
}: ApplyLookModalProps) {
  const previewUri = useMemo(
    () => resolvePreviewDisplayUri(previewPhoto),
    [previewPhoto],
  );
  const [selectedLookId, setSelectedLookId] = useState<LookId>(currentLookId);
  const [showAfter, setShowAfter] = useState(true);
  const selectedTileRef = useRef<View | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setSelectedLookId(currentLookId);
    setShowAfter(true);
  }, [visible, currentLookId]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    focusDesktopNode(selectedTileRef.current);
    AccessibilityInfo.announceForAccessibility(`${TITLE}. ${albumName}`);
  }, [visible, albumName]);

  const handleSelectLook = useCallback((lookId: LookId) => {
    setSelectedLookId(lookId);
    const label = LOOK_CATALOG.find(look => look.id === lookId)?.label;
    AccessibilityInfo.announceForAccessibility(`${label} selected`);
  }, []);

  const handleToggle = useCallback((nextShowAfter: boolean) => {
    setShowAfter(nextShowAfter);
    AccessibilityInfo.announceForAccessibility(
      nextShowAfter ? 'Showing after' : 'Showing before, original photo',
    );
  }, []);

  const handleKeyDown = useCallback(
    (event: unknown) => {
      const native = (
        event as { nativeEvent?: { key?: string; code?: string } }
      ).nativeEvent;
      if (native?.key === 'Escape' || native?.code === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      width={720}
      height={803}
      showCloseButton={false}
      contentStyle={styles.modalContent}
    >
      <View
        style={styles.card}
        onKeyDown={handleKeyDown}
        keyDownEvents={escapeKeyDownEvents}
      >
        <Decorations />
        <View style={styles.content}>
          <View style={styles.textBlock}>
            <Text style={styles.title} accessibilityRole="header">
              {TITLE}
            </Text>
            <Text style={styles.subtitle}>{albumName}</Text>
          </View>
          <View style={styles.body}>
            <View style={styles.preview}>
              {previewUri ? (
                <LookPreviewImage
                  uri={previewUri}
                  lookId={showAfter ? selectedLookId : 'original'}
                  style={styles.previewPhoto}
                />
              ) : null}
              <View style={styles.toggle}>
                <LookCompareToggle
                  showAfter={showAfter}
                  onChange={handleToggle}
                />
              </View>
            </View>
            <Text style={styles.caption}>{CAPTION}</Text>
            <View style={styles.tiles} accessibilityRole="radiogroup">
              {LOOK_CATALOG.map(look => (
                <LookPickerTile
                  key={look.id}
                  lookId={look.id}
                  label={look.label}
                  previewUri={previewUri}
                  selected={look.id === selectedLookId}
                  current={look.id === currentLookId}
                  onSelect={handleSelectLook}
                  focusRef={
                    look.id === currentLookId ? selectedTileRef : undefined
                  }
                />
              ))}
            </View>
            <Text style={styles.note}>{NOTE}</Text>
          </View>
          <View style={styles.actions}>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
              onPress={() => onUseLook(selectedLookId)}
              accessibilityRole="button"
              accessibilityLabel="Use this look"
            >
              <Text style={styles.primaryButtonText}>Use this look</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
              ]}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.closeButton,
            pressed && styles.pressed,
          ]}
          onPress={onClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <IconClose width={20} height={20} color={colors.textDark} />
          </View>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  decorations: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    width: 480,
    alignItems: 'center',
    gap: 24,
  },
  textBlock: {
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    lineHeight: 28 * 1.2,
    color: colors.textDark,
    textAlign: 'center',
    fontWeight: '400',
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 16 * 1.4,
    color: SUBTITLE_COLOR,
    textAlign: 'center',
  },
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
  actions: {
    gap: 12,
    alignItems: 'center',
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    paddingHorizontal: 32,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    ...sansBoldStyle,
    fontSize: 16,
    lineHeight: 16 * 1.6,
    color: colors.white,
  },
  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 14 * 1.44,
    color: colors.textMuted,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
  closeButton: {
    position: 'absolute',
    top: 24,
    right: 24,
    zIndex: 3,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halfCircleDecor: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  quarterOrangeDecor: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  quarterRedDecor: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  circleBlueDecor: {
    position: 'absolute',
    bottom: 24,
    left: 24,
  },
  circleLightBlueDecor: {
    position: 'absolute',
    top: 80,
    right: 0,
  },
});
