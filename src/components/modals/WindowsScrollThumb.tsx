import type { ScrollThumbMetrics } from '@hooks/useScrollThumbMetrics';
import { colors } from '@lib/ui/colors';
import { StyleSheet, View } from 'react-native';

const THUMB_WIDTH = 3;
const THUMB_MIN_HEIGHT = 28;
const THUMB_INSET = 4;
const OVERFLOW_EPSILON = 1;

/**
 * Always-on thin scroll thumb for Windows: Fabric's native scrollbar stays
 * hidden until hover, so overflow is not visible on the white modal.
 * Render it as the last child of the card so its zIndex is not trapped.
 */
export function WindowsScrollThumb({
  viewportHeight,
  contentHeight,
  scrollOffset,
}: ScrollThumbMetrics) {
  if (
    viewportHeight <= 0 ||
    contentHeight <= viewportHeight + OVERFLOW_EPSILON
  ) {
    return null;
  }
  const trackHeight = Math.max(0, viewportHeight - THUMB_INSET * 2);
  const thumbHeight = Math.max(
    THUMB_MIN_HEIGHT,
    (viewportHeight / contentHeight) * trackHeight,
  );
  const maxOffset = contentHeight - viewportHeight;
  const maxThumbTravel = Math.max(0, trackHeight - thumbHeight);
  const thumbTop =
    THUMB_INSET + Math.min(1, scrollOffset / maxOffset) * maxThumbTravel;

  return (
    <View
      style={styles.track}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={[
          styles.thumb,
          { height: thumbHeight, transform: [{ translateY: thumbTop }] },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    position: 'absolute',
    top: 0,
    right: THUMB_INSET,
    bottom: 0,
    width: THUMB_WIDTH,
    zIndex: 4,
  },
  thumb: {
    width: THUMB_WIDTH,
    borderRadius: THUMB_WIDTH,
    backgroundColor: colors.textMuted,
    opacity: 0.45,
  },
});
