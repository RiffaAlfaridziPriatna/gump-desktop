import type { LookImportFailure } from '@components/look/LookImportErrorBanner';
import { LookPickerBody } from '@components/look/LookPickerBody';
import { resolveLookPreviewUri } from '@components/look/resolveLookPreviewUri';
import { Modal, Pressable } from '@components/ui';
import { ModalDecorations } from './ModalDecorations';
import { WindowsScrollThumb } from './WindowsScrollThumb';
import { AlbumCustomLookContext } from '@context/albumCustomLook';
import { useImportAlbumPreset } from '@hooks/useImportAlbumPreset';
import { useScrollThumbMetrics } from '@hooks/useScrollThumbMetrics';
import type { CulledAlbumPhoto } from '@lib/culledAlbum/types';
import type { CustomLook, LookId } from '@lib/look/types';
import { reportError } from '@lib/observability/reportError';
import { colors } from '@lib/ui/colors';
import { fonts, sansBoldStyle } from '@lib/ui/typography';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import IconClose from '../../assets/images/icon_close.svg';

type ApplyLookModalProps = {
  visible: boolean;
  albumId: string;
  albumName: string;
  customLook: CustomLook | null;
  previewPhoto: CulledAlbumPhoto | undefined;
  currentLookId: LookId;
  onUseLook: (lookId: LookId) => void;
  onClose: () => void;
};

const TITLE = 'Edit Photos';
// Figma GumpLight/Grey4; no matching token in colors.ts.
const SUBTITLE_COLOR = '#454545';
// 20 high text + 12 + 12 = 44 point target without growing the button.
const TEXT_BUTTON_HIT_SLOP = { top: 12, bottom: 12, left: 0, right: 0 };
const CLOSE_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };
const HANDLED_BUBBLING = 3;
// Title band height until onLayout reports it: 40 + 34 + 12 + 22 + 24.
const TITLE_BAND_FALLBACK_HEIGHT = 132;
const USE_CUSTOM_SCROLL_THUMB = Platform.OS === 'windows';

const escapeKeyDownEvents =
  Platform.OS === 'windows'
    ? [{ code: 'Escape', handledEventPhase: HANDLED_BUBBLING }]
    : [{ key: 'Escape' }];

export function ApplyLookModal({
  visible,
  albumId,
  albumName,
  customLook,
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
  const [importFailure, setImportFailure] = useState<LookImportFailure | null>(
    null,
  );
  const [titleBandHeight, setTitleBandHeight] = useState(
    TITLE_BAND_FALLBACK_HEIGHT,
  );
  const { metrics: scrollMetrics, scrollHandlers } = useScrollThumbMetrics(
    USE_CUSTOM_SCROLL_THUMB,
  );
  const failureIdRef = useRef(0);
  const { importPreset } = useImportAlbumPreset(albumId);
  const customLookSource = useMemo(
    () => ({ albumId, customLook }),
    [albumId, customLook],
  );
  useEffect(() => {
    if (!visible) {
      return;
    }
    setSelectedLookId(currentLookId);
    setShowAfter(true);
    setImportFailure(null);
  }, [visible, currentLookId]);

  const handleSelectLook = useCallback((lookId: LookId) => {
    setImportFailure(null);
    setSelectedLookId(lookId);
  }, []);

  // Failures are reported inside importAlbumPreset; here they only drive the banner.
  const handleUploadPreset = useCallback(() => {
    setImportFailure(null);
    importPreset()
      .then(result => {
        if (result.status === 'imported') {
          setSelectedLookId('custom');
          setShowAfter(true);
        } else if (result.status === 'failed') {
          failureIdRef.current += 1;
          setImportFailure({ reason: result.reason, id: failureIdRef.current });
        }
      })
      .catch(error => {
        reportError(error, { step: 'importAlbumPreset' });
        failureIdRef.current += 1;
        setImportFailure({ reason: 'unreadable', id: failureIdRef.current });
      });
  }, [importPreset]);

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
      width={842}
      height={803}
      fit="clamp"
      showCloseButton={false}
      contentStyle={styles.modalContent}
    >
      <View
        style={styles.card}
        onKeyDown={handleKeyDown}
        keyDownEvents={escapeKeyDownEvents}
      >
        {/* z: scroll < pinned title band < decorations < close < Windows thumb. */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: titleBandHeight },
          ]}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          showsVerticalScrollIndicator={!USE_CUSTOM_SCROLL_THUMB}
          {...scrollHandlers}
        >
          <View style={styles.content}>
            <AlbumCustomLookContext.Provider value={customLookSource}>
              <LookPickerBody
                visible={visible}
                previewUri={previewUri}
                currentLookId={currentLookId}
                selectedLookId={selectedLookId}
                showAfter={showAfter}
                customLook={customLook}
                importError={importFailure}
                onUploadPreset={handleUploadPreset}
                onSelectLook={handleSelectLook}
                onShowAfterChange={setShowAfter}
              />
            </AlbumCustomLookContext.Provider>
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
                hitSlop={TEXT_BUTTON_HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
        <View
          style={styles.titleBand}
          onLayout={event => {
            const next = Math.ceil(event.nativeEvent.layout.height);
            if (next > 0) {
              setTitleBandHeight(next);
            }
          }}
        >
          <Text style={styles.title} accessibilityRole="header">
            {TITLE}
          </Text>
          <Text style={styles.subtitle}>{albumName}</Text>
        </View>
        <View style={styles.decorationLayer} pointerEvents="none">
          <ModalDecorations />
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.closeButton,
            pressed && styles.pressed,
          ]}
          onPress={onClose}
          hitSlop={CLOSE_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <IconClose width={24} height={24} color={colors.textDark} />
          </View>
        </Pressable>
        {USE_CUSTOM_SCROLL_THUMB ? (
          <WindowsScrollThumb {...scrollMetrics} />
        ) : null}
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
    position: 'relative',
    overflow: 'hidden',
  },
  // No flexGrow + center here: on Windows that hid the look tiles below the fold.
  scroll: {
    flex: 1,
    alignSelf: 'stretch',
    minHeight: 0,
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 32,
  },
  content: {
    width: 602,
    alignItems: 'center',
    gap: 24,
  },
  decorationLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  titleBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    backgroundColor: colors.white,
    paddingTop: 40,
    paddingBottom: 24,
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
