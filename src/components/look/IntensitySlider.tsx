import {colors} from '@lib/ui/colors';
import {useCallback, useMemo, useRef, useState} from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  View,
} from 'react-native';

type IntensitySliderProps = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
};

const THUMB_SIZE = 16;
const THUMB_HIT_SLOP = 24;

function clampIntensity(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function IntensitySlider({
  value,
  onChange,
  disabled = false,
}: IntensitySliderProps) {
  const trackWidthRef = useRef(0);
  const dragOriginXRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [trackWidth, setTrackWidth] = useState(0);

  const emitFromTrackX = useCallback((trackX: number) => {
    const width = trackWidthRef.current;
    if (width <= 0) {
      return;
    }
    onChangeRef.current(clampIntensity((trackX / width) * 100));
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: event => {
          const width = trackWidthRef.current;
          if (width <= 0) {
            return;
          }

          const valueX = (valueRef.current / 100) * width;
          const touchX = event.nativeEvent.locationX;
          // Thumb touches often report locationX relative to the thumb (0–16),
          // not the track — that would jump 80% → ~0%. Keep current value then.
          const looksThumbLocal =
            touchX >= 0 &&
            touchX <= THUMB_SIZE + 4 &&
            Math.abs(touchX - valueX) > THUMB_HIT_SLOP;
          const nearThumb = Math.abs(touchX - valueX) <= THUMB_HIT_SLOP;

          if (looksThumbLocal || nearThumb) {
            dragOriginXRef.current = valueX;
            return;
          }

          dragOriginXRef.current = touchX;
          emitFromTrackX(touchX);
        },
        onPanResponderMove: (_event, gestureState) => {
          emitFromTrackX(dragOriginXRef.current + gestureState.dx);
        },
      }),
    [disabled, emitFromTrackX],
  );

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width === trackWidthRef.current) {
      return;
    }
    trackWidthRef.current = width;
    setTrackWidth(width);
  }, []);

  const fillWidth = trackWidth > 0 ? (value / 100) * trackWidth : 0;
  const thumbLeft = Math.max(
    0,
    Math.min(trackWidth - THUMB_SIZE, fillWidth - THUMB_SIZE / 2),
  );

  return (
    <View
      style={[styles.hitArea, disabled && styles.trackDisabled]}
      onLayout={handleLayout}
      {...panResponder.panHandlers}
      accessibilityRole="adjustable"
      accessibilityLabel="Look intensity"
      accessibilityValue={{min: 0, max: 100, now: value}}>
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.fill, {width: fillWidth}]} />
        <View style={[styles.thumb, {left: thumbLeft}]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hitArea: {
    flex: 1,
    height: 24,
    justifyContent: 'center',
  },
  track: {
    height: 6,
    borderRadius: 4,
    backgroundColor: colors.progressTrack,
    justifyContent: 'center',
    overflow: 'visible',
  },
  trackDisabled: {
    opacity: 0.4,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  thumb: {
    position: 'absolute',
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.white,
    top: -5,
  },
});
