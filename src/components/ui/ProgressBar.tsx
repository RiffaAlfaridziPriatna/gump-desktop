import {colors} from '@lib/ui/colors';
import {useState} from 'react';
import {LayoutChangeEvent, StyleSheet, View, ViewStyle} from 'react-native';

type ProgressBarProps = {
  progress: number;
  height?: number;
  trackColor?: string;
  fillColor?: string;
  /** Flat 1px outlined bar with a square fill (toast in Figma). */
  square?: boolean;
  style?: ViewStyle;
};

export function ProgressBar({
  progress,
  height = 12,
  trackColor = colors.progressTrack,
  fillColor = colors.accent,
  square = false,
  style,
}: ProgressBarProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  const radius = square ? 0 : height / 2;
  const fillWidthPx = trackWidth > 0 ? clampedProgress * trackWidth : 0;

  function handleTrackLayout(event: LayoutChangeEvent) {
    const {width} = event.nativeEvent.layout;
    if (width > 0 && width !== trackWidth) {
      setTrackWidth(width);
    }
  }

  return (
    <View
      collapsable={false}
      onLayout={handleTrackLayout}
      style={[
        styles.track,
        square
          ? [styles.squareTrack, {height}]
          : {height, borderRadius: radius, backgroundColor: trackColor},
        style,
      ]}>
      <View
        collapsable={false}
        style={[
          styles.fill,
          {
            height,
            borderRadius: radius,
            backgroundColor: fillColor,
            width: fillWidthPx,
          },
          square && styles.squareFill,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    alignSelf: 'stretch',
    overflow: 'hidden',
  },
  squareTrack: {
    overflow: 'visible',
    borderWidth: 1,
    borderColor: colors.textGray,
  },
  squareFill: {
    left: -1,
    top: -1,
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
