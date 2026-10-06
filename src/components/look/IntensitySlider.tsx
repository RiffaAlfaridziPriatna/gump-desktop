import {colors} from '@lib/ui/colors';
import {useCallback, useRef, useState} from 'react';
import {
  type GestureResponderEvent,
  StyleSheet,
  View,
} from 'react-native';

type IntensitySliderProps = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
};

const THUMB_SIZE = 16;
const TRACK_HEIGHT = 6;
const HIT_HEIGHT = 32;

function clampIntensity(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/**
 * Pointer-driven slider (mouse/touch). Uses pageX + measureInWindow instead of
 * PanResponder — RNW ScrollView/Modal often swallows pan move events.
 */
export function IntensitySlider({
  value,
  onChange,
  disabled = false,
}: IntensitySliderProps) {
  const hitRef = useRef<View>(null);
  const trackWidthRef = useRef(0);
  const trackOriginXRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [trackWidth, setTrackWidth] = useState(0);

  const emitFromPageX = useCallback((pageX: number) => {
    const width = trackWidthRef.current;
    if (width <= 0) {
      return;
    }
    const trackX = pageX - trackOriginXRef.current;
    onChangeRef.current(clampIntensity((trackX / width) * 100));
  }, []);

  const syncTrackGeometry = useCallback((then?: (pageX: number) => void, pageX?: number) => {
    hitRef.current?.measureInWindow((x, _y, width) => {
      if (width > 0) {
        trackOriginXRef.current = x;
        if (width !== trackWidthRef.current) {
          trackWidthRef.current = width;
          setTrackWidth(width);
        }
      }
      if (then != null && pageX != null) {
        then(pageX);
      }
    });
  }, []);

  const handleGrant = useCallback(
    (event: GestureResponderEvent) => {
      if (disabled) {
        return;
      }
      const pageX = event.nativeEvent.pageX;
      syncTrackGeometry(emitFromPageX, pageX);
    },
    [disabled, emitFromPageX, syncTrackGeometry],
  );

  const handleMove = useCallback(
    (event: GestureResponderEvent) => {
      if (disabled) {
        return;
      }
      emitFromPageX(event.nativeEvent.pageX);
    },
    [disabled, emitFromPageX],
  );

  const fillWidth = trackWidth > 0 ? (value / 100) * trackWidth : 0;
  const thumbLeft = Math.max(
    0,
    Math.min(trackWidth - THUMB_SIZE, fillWidth - THUMB_SIZE / 2),
  );
  const thumbTop = (HIT_HEIGHT - THUMB_SIZE) / 2;

  return (
    <View
      ref={hitRef}
      style={[styles.hitArea, disabled && styles.trackDisabled]}
      onLayout={event => {
        const width = event.nativeEvent.layout.width;
        if (width > 0 && width !== trackWidthRef.current) {
          trackWidthRef.current = width;
          setTrackWidth(width);
        }
        syncTrackGeometry();
      }}
      onStartShouldSetResponder={() => !disabled}
      onMoveShouldSetResponder={() => !disabled}
      onStartShouldSetResponderCapture={() => !disabled}
      onMoveShouldSetResponderCapture={() => !disabled}
      onResponderTerminationRequest={() => false}
      onResponderGrant={handleGrant}
      onResponderMove={handleMove}
      accessibilityRole="adjustable"
      accessibilityLabel="Look intensity"
      accessibilityState={{disabled}}
      accessibilityValue={{min: 0, max: 100, now: value}}>
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.fill, {width: fillWidth}]} />
      </View>
      <View
        pointerEvents="none"
        style={[styles.thumb, {left: thumbLeft, top: thumbTop}]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hitArea: {
    flex: 1,
    height: HIT_HEIGHT,
    justifyContent: 'center',
    position: 'relative',
    overflow: 'visible',
  },
  track: {
    height: TRACK_HEIGHT,
    borderRadius: 4,
    backgroundColor: colors.progressTrack,
    overflow: 'hidden',
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
  },
});
