import { ContainedLookImage } from '@components/look/ContainedLookImage';
import { IntensitySlider } from '@components/look/IntensitySlider';
import { Modal, Pressable, TouchableOpacity } from '@components/ui';
import type { CulledAlbumPhoto } from '@lib/culledAlbum/types';
import { LOOK_CATALOG } from '@lib/look/lookCatalog';
import {
  DEFAULT_LOOK_INTENSITY,
  type LookId,
} from '@lib/look/types';
import {
  isUsableDetailUri,
  isUsableThumbnailUri,
} from '@lib/storage/localStorage';
import { colors } from '@lib/ui/colors';
import { fonts, sansBoldStyle } from '@lib/ui/typography';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import CircleBlue from '../../assets/images/upload/blue_circle.svg';
import HalfCircle from '../../assets/images/upload/half_circle.svg';
import CircleLightBlue from '../../assets/images/upload/light_blue_circle.svg';
import QuarterCircleOrange from '../../assets/images/upload/orange_quarter_circle.svg';
import QuarterCircleRed from '../../assets/images/upload/red_quarter_circle.svg';

type ApplyLookModalProps = {
  visible: boolean;
  selectedPhotos: CulledAlbumPhoto[];
  onClose: () => void;
  onApply: (lookId: LookId, lookIntensity: number) => Promise<void>;
};

const SCROLL_OVERFLOW_EPS = 1;
/** Fallback until title overlay reports its laid-out height. */
const TITLE_OVERLAY_FALLBACK_HEIGHT = 98;
/** Always-on Windows thumb (Fabric native shy thumbs vanish into white). */
const CUSTOM_SCROLL_THUMB_WIDTH = 3;
const CUSTOM_SCROLL_THUMB_MIN_HEIGHT = 28;
const CUSTOM_SCROLL_THUMB_INSET = 4;

/** Stacking: scroll (0) < title (1) < top decoration (2) < custom thumb (3). */
const Z_SCROLL = 0;
const Z_TITLE = 1;
const Z_TOP_DECOR = 2;
const Z_SCROLL_THUMB = 3;

const USE_CUSTOM_SCROLL_THUMB = Platform.OS === 'windows';

/** Corner shapes that sit under the title — keep behind the title band. */
function BottomDecor() {
  return (
    <>
      <QuarterCircleRed style={styles.quarterRedDecor} width={80} height={80} />
      <CircleBlue style={styles.circleBlueDecor} width={32} height={32} />
    </>
  );
}

/**
 * Top shapes above the title band so white title bg doesn't clip them.
 * No absoluteFill wrapper — that would paint over the scroll edge.
 */
function TopDecor() {
  return (
    <>
      <HalfCircle
        style={[styles.halfCircleDecor, styles.topDecorItem]}
        width={72}
        pointerEvents="none"
      />
      <QuarterCircleOrange
        style={[styles.quarterOrangeDecor, styles.topDecorItem]}
        width={98}
        height={98}
        pointerEvents="none"
      />
      <CircleLightBlue
        style={[styles.circleLightBlueDecor, styles.topDecorItem]}
        width={36}
        height={36}
        pointerEvents="none"
      />
    </>
  );
}

function WindowsScrollThumb({
  visible,
  viewportHeight,
  contentHeight,
  scrollOffset,
}: {
  visible: boolean;
  viewportHeight: number;
  contentHeight: number;
  scrollOffset: number;
}) {
  if (!visible || viewportHeight <= 0 || contentHeight <= viewportHeight) {
    return null;
  }

  const trackHeight = Math.max(0, viewportHeight - CUSTOM_SCROLL_THUMB_INSET * 2);
  const thumbHeight = Math.max(
    CUSTOM_SCROLL_THUMB_MIN_HEIGHT,
    (viewportHeight / contentHeight) * trackHeight,
  );
  const maxOffset = contentHeight - viewportHeight;
  const maxThumbTravel = Math.max(0, trackHeight - thumbHeight);
  const thumbTop =
    CUSTOM_SCROLL_THUMB_INSET +
    (maxOffset > 0 ? (scrollOffset / maxOffset) * maxThumbTravel : 0);

  return (
    <View style={styles.customScrollThumbTrack} pointerEvents="none">
      <View
        style={[
          styles.customScrollThumb,
          {height: thumbHeight, transform: [{translateY: thumbTop}]},
        ]}
      />
    </View>
  );
}

/**
 * Oriented derivative for modal preview + LUT bake. Prefer the 1920 thumb over
 * 4096 detail — modal is ~480px wide and baking from detail/master is slow.
 * Never use the album master on Windows (XAML Image skips EXIF).
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
  // Last resort (may look sideways on Windows until derivatives exist).
  return photo.file.uri || '';
}

export function ApplyLookModal({
  visible,
  selectedPhotos,
  onClose,
  onApply,
}: ApplyLookModalProps) {
  const previewPhoto = selectedPhotos[0];
  // Bake from oriented detail/thumb (not the multi‑MB master). Derivatives are
  // already EXIF-correct and decode much faster for modal + chip previews.
  const previewUri = useMemo(
    () => resolvePreviewDisplayUri(previewPhoto),
    [previewPhoto],
  );

  const [lookId, setLookId] = useState<LookId>('warmRomantic');
  const [intensity, setIntensity] = useState(DEFAULT_LOOK_INTENSITY);
  const [applying, setApplying] = useState(false);
  /** False while dragging intensity so Windows mouse drag isn't swallowed. */
  const [intensityScrollAllowed, setIntensityScrollAllowed] = useState(true);
  const [canScroll, setCanScroll] = useState(false);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [titleOverlayHeight, setTitleOverlayHeight] = useState(
    TITLE_OVERLAY_FALLBACK_HEIGHT,
  );
  const viewportHeightRef = useRef(0);
  const contentHeightRef = useRef(0);

  const syncScrollMetrics = useCallback(() => {
    const viewportH = viewportHeightRef.current;
    const contentH = contentHeightRef.current;
    setViewportHeight(viewportH);
    setContentHeight(contentH);
    if (viewportH <= 0 || contentH <= 0) {
      setCanScroll(false);
      return;
    }
    setCanScroll(contentH > viewportH + SCROLL_OVERFLOW_EPS);
  }, []);

  useEffect(() => {
    if (!visible) {
      viewportHeightRef.current = 0;
      contentHeightRef.current = 0;
      setCanScroll(false);
      setScrollOffset(0);
      setViewportHeight(0);
      setContentHeight(0);
      setIntensityScrollAllowed(true);
      setTitleOverlayHeight(TITLE_OVERLAY_FALLBACK_HEIGHT);
      return;
    }
    const seed = selectedPhotos[0];
    const seedId = seed?.lookId;
    const catalogIds = new Set(LOOK_CATALOG.map(look => look.id));
    const nextId: LookId =
      seedId && seedId !== 'original' && catalogIds.has(seedId)
        ? seedId
        : 'warmRomantic';
    setLookId(nextId);
    setIntensity(seed?.lookIntensity ?? DEFAULT_LOOK_INTENSITY);
    setApplying(false);
    setIntensityScrollAllowed(true);
  }, [selectedPhotos, visible]);

  const intensityDisabled = lookId === 'original';

  const handleIntensityDragStart = useCallback(() => {
    setIntensityScrollAllowed(false);
  }, []);

  const handleIntensityDragEnd = useCallback(() => {
    setIntensityScrollAllowed(true);
  }, []);

  const handleApply = useCallback(async () => {
    if (applying || selectedPhotos.length === 0) {
      return;
    }
    setApplying(true);
    // Let React paint "Applying..." before updateLook touches the photo store.
    await new Promise<void>(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });
    try {
      await onApply(
        lookId,
        intensityDisabled ? DEFAULT_LOOK_INTENSITY : intensity,
      );
      onClose();
    } catch (error) {
      console.error('[ApplyLookModal] Failed to apply look', error);
    } finally {
      setApplying(false);
    }
  }, [
    applying,
    intensity,
    intensityDisabled,
    lookId,
    onApply,
    onClose,
    selectedPhotos.length,
  ]);

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      width={720}
      height={740}
      contentStyle={styles.modalContent}>
      {/*
        Layers (z): scroll/title in body → top decor 2 → Windows thumb 3.
        One flex:1 ScrollView fills the modal (required on RNW — a title flex
        sibling above ScrollView breaks height constraints). Title is an absolute
        white band so it stays pinned. Top decor sits above that band; bottom
        decor stays at corners under the scroll surface. Disable scroll while
        dragging intensity (Windows).
        Fabric's native shy scrollbar flashes wide then hides until hover — on
        Windows we draw a custom always-on thin thumb instead when overflowing.
      */}
      <BottomDecor />
      <View style={styles.body}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            {paddingTop: titleOverlayHeight},
          ]}
          scrollEnabled={intensityScrollAllowed}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          bounces={false}
          showsVerticalScrollIndicator={!USE_CUSTOM_SCROLL_THUMB}
          onLayout={event => {
            viewportHeightRef.current = event.nativeEvent.layout.height;
            syncScrollMetrics();
          }}
          onContentSizeChange={(_width, height) => {
            contentHeightRef.current = height;
            syncScrollMetrics();
          }}
          onScroll={event => {
            const {contentOffset, contentSize, layoutMeasurement} =
              event.nativeEvent;
            viewportHeightRef.current = layoutMeasurement.height;
            contentHeightRef.current = contentSize.height;
            setScrollOffset(Math.max(0, contentOffset.y));
            syncScrollMetrics();
          }}
          scrollEventThrottle={16}>
          <View style={styles.content}>
            <View style={styles.previewContainer}>
              {previewUri ? (
                <ContainedLookImage
                  uri={previewUri}
                  width={480}
                  height={326}
                  lookId={lookId}
                  lookIntensity={intensityDisabled ? 0 : intensity}
                  isTransparent={false}
                />
              ) : (
                <View style={styles.previewPlaceholder} />
              )}

              <View style={styles.lookRow}>
                {LOOK_CATALOG.map(look => {
                  const selected = look.id === lookId;
                  return (
                    <Pressable
                      key={look.id}
                      onPress={() => setLookId(look.id)}
                      style={[
                        styles.lookItem,
                        selected && styles.lookItemSelected,
                      ]}
                      accessibilityRole="button"
                      accessibilityState={{selected}}
                      accessibilityLabel={look.label}>
                      {previewUri ? (
                        <ContainedLookImage
                          uri={previewUri}
                          width={106}
                          height={70}
                          borderRadius={4}
                          lookId={look.id}
                          // Chips match Figma: always show full-strength look.
                          lookIntensity={look.id === 'original' ? 0 : 100}
                        />
                      ) : (
                        <View
                          style={[
                            styles.thumbPlaceholder,
                            selected && styles.thumbPlaceholderSelected,
                          ]}
                        />
                      )}
                      <Text
                        style={[
                          styles.lookLabel,
                          selected && styles.lookLabelSelected,
                        ]}
                        numberOfLines={1}>
                        {look.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.intensityRow}>
                <Text style={styles.intensityLabel}>Intensity</Text>
                <IntensitySlider
                  value={intensity}
                  onChange={setIntensity}
                  disabled={intensityDisabled}
                  onDragStart={handleIntensityDragStart}
                  onDragEnd={handleIntensityDragEnd}
                />
                <Text style={styles.intensityValue}>
                  {intensityDisabled ? '—' : `${intensity}%`}
                </Text>
              </View>
            </View>

            <View style={styles.buttonContainer}>
              <TouchableOpacity
                style={[
                  styles.applyButton,
                  applying && styles.applyButtonDisabled,
                ]}
                onPress={handleApply}
                disabled={applying || selectedPhotos.length === 0}
                activeOpacity={0.8}>
                <Text style={styles.applyButtonText}>
                  {applying ? 'Applying...' : 'Apply to Selected'}
                </Text>
              </TouchableOpacity>

              <Pressable onPress={onClose} accessibilityRole="button">
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>

        <View
          style={styles.titleOverlay}
          pointerEvents="none"
          onLayout={event => {
            const next = Math.ceil(event.nativeEvent.layout.height);
            if (next > 0) {
              setTitleOverlayHeight(current => (current === next ? current : next));
            }
          }}>
          <Text style={styles.title}>Apply Look</Text>
        </View>
      </View>
      <TopDecor />
      {/* Sibling of body/decor — must not live inside body or zIndex is trapped. */}
      {USE_CUSTOM_SCROLL_THUMB ? (
        <WindowsScrollThumb
          visible={canScroll}
          viewportHeight={viewportHeight}
          contentHeight={contentHeight}
          scrollOffset={scrollOffset}
        />
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    alignItems: 'stretch',
  },
  body: {
    flex: 1,
    width: '100%',
    minHeight: 0,
    alignItems: 'stretch',
    overflow: 'hidden',
    zIndex: Z_SCROLL,
  },
  scroll: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
    minHeight: 0,
    zIndex: Z_SCROLL,
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: 24,
    paddingHorizontal: 32,
  },
  content: {
    width: '100%',
    alignItems: 'center',
    gap: 24,
  },
  titleOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: Z_TITLE,
    backgroundColor: colors.white,
    paddingTop: 40,
    paddingBottom: 24,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    lineHeight: 28 * 1.2,
    color: colors.textDark,
    textAlign: 'center',
    fontWeight: '700',
  },
  topDecorItem: {
    zIndex: Z_TOP_DECOR,
  },
  customScrollThumbTrack: {
    position: 'absolute',
    top: 0,
    right: CUSTOM_SCROLL_THUMB_INSET,
    bottom: 0,
    width: CUSTOM_SCROLL_THUMB_WIDTH,
    zIndex: Z_SCROLL_THUMB,
  },
  customScrollThumb: {
    width: CUSTOM_SCROLL_THUMB_WIDTH,
    borderRadius: CUSTOM_SCROLL_THUMB_WIDTH,
    backgroundColor: colors.textMuted,
    opacity: 0.45,
  },
  previewContainer: {
    gap: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPlaceholder: {
    width: 480,
    height: 326,
    borderRadius: 8,
    backgroundColor: colors.cardGrayLight,
  },
  lookRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    width: '100%',
  },
  lookItem: {
    width: 108,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    padding: 4,
    paddingBottom: 6,
  },
  lookItemSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent + "1A",
  },
  thumbPlaceholder: {
    width: 106,
    height: 70,
    borderRadius: 4,
    backgroundColor: colors.cardGrayLight,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  thumbPlaceholderSelected: {
    borderColor: colors.accent,
  },
  lookLabel: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  lookLabelSelected: {
    ...sansBoldStyle,
    fontSize: 12,
    lineHeight: 14,
    color: colors.textDark,
  },
  intensityRow: {
    width: 480,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 8,
    paddingHorizontal: 24,
    overflow: 'visible',
  },
  intensityLabel: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textDark,
  },
  intensityValue: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textDark,
    textAlign: 'right',
    width: 40,
    fontVariant: ['tabular-nums'],
  },
  buttonContainer: {
    gap: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButton: {
    minHeight: 48,
    minWidth: 240,
    borderRadius: 24,
    backgroundColor: colors.accent,
    paddingHorizontal: 32,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  applyButtonDisabled: {
    opacity: 0.5,
  },
  applyButtonText: {
    ...sansBoldStyle,
    fontSize: 16,
    color: colors.white,
  },
  cancelText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textMuted,
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
