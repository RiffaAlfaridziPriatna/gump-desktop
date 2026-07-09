import {colors} from '@lib/ui/colors';
import {useState} from 'react';
import {LayoutChangeEvent, StyleSheet, View, ViewStyle} from 'react-native';

type ProgressBarProps = {
  progress: number;
  height?: number;
  trackColor?: string;
  fillColor?: string;
  style?: ViewStyle;
};

export function ProgressBar({
  progress,
  height = 12,
  trackColor = colors.progressTrack,
  fillColor = colors.accent,
  style,
}: ProgressBarProps) {
  const [trackWidth, setTrackWidth] = useState(0);
  const clampedProgress = Math.min(Math.max(progress, 0), 1);
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
        {height, backgroundColor: trackColor},
        style,
      ]}>
      <View
        collapsable={false}
        style={[
          styles.fill,
          {
            height,
            backgroundColor: fillColor,
            width: fillWidthPx,
          },
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
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
});
