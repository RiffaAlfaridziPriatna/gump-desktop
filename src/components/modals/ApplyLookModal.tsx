import { LookPickerDecorations } from '@components/look/LookPickerDecorations';
import { LookPickerBody } from '@components/look/LookPickerBody';
import { resolveLookPreviewUri } from '@components/look/resolveLookPreviewUri';
import { Modal, Pressable } from '@components/ui';
import type { CulledAlbumPhoto } from '@lib/culledAlbum/types';
import type { LookId } from '@lib/look/types';
import { colors } from '@lib/ui/colors';
import { fonts, sansBoldStyle } from '@lib/ui/typography';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import IconClose from '../../assets/images/icon_close.svg';

type ApplyLookModalProps = {
  visible: boolean;
  albumName: string;
  previewPhoto: CulledAlbumPhoto | undefined;
  currentLookId: LookId;
  onUseLook: (lookId: LookId) => void;
  onClose: () => void;
};

const TITLE = 'Edit Photos';
// Figma GumpLight/Grey4; no matching token in colors.ts.
const SUBTITLE_COLOR = '#454545';
const HANDLED_BUBBLING = 3;

const escapeKeyDownEvents =
  Platform.OS === 'windows'
    ? [{ code: 'Escape', handledEventPhase: HANDLED_BUBBLING }]
    : [{ key: 'Escape' }];

export function ApplyLookModal({
  visible,
  albumName,
  previewPhoto,
  currentLookId,
  onUseLook,
  onClose,
}: ApplyLookModalProps) {
  const previewUri = useMemo(
    () => resolveLookPreviewUri(previewPhoto),
    [previewPhoto],
  );
  const [selectedLookId, setSelectedLookId] = useState<LookId>(currentLookId);
  const [showAfter, setShowAfter] = useState(true);
  useEffect(() => {
    if (!visible) {
      return;
    }
    setSelectedLookId(currentLookId);
    setShowAfter(true);
  }, [visible, currentLookId]);

  useEffect(() => {
    if (visible) {
      AccessibilityInfo.announceForAccessibility(`${TITLE}. ${albumName}`);
    }
  }, [visible, albumName]);

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
        <LookPickerDecorations />
        <View style={styles.content}>
          <View style={styles.textBlock}>
            <Text style={styles.title} accessibilityRole="header">
              {TITLE}
            </Text>
            <Text style={styles.subtitle}>{albumName}</Text>
          </View>
          <LookPickerBody
            visible={visible}
            previewUri={previewUri}
            currentLookId={currentLookId}
            selectedLookId={selectedLookId}
            showAfter={showAfter}
            onSelectLook={setSelectedLookId}
            onShowAfterChange={setShowAfter}
          />
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
});
