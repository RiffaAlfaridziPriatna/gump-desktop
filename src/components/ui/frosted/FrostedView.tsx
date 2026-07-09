import {colors} from '@lib/ui/colors';
import {Platform, StyleSheet, View} from 'react-native';
import {BlurView} from '@react-native-community/blur';

import type {FrostedViewProps} from './types';

export function FrostedView({
  children,
  style,
  blurType = 'light',
  blurAmount = 8,
  fallbackColor = colors.badge,
  ...rest
}: FrostedViewProps) {
  if (Platform.OS === 'ios' || Platform.OS === 'android') {
    return (
      <BlurView
        style={[styles.root, style]}
        blurType={blurType}
        blurAmount={blurAmount}
        reducedTransparencyFallbackColor={fallbackColor}
        {...rest}>
        <View
          pointerEvents="none"
          style={[styles.tint, {backgroundColor: fallbackColor}]}
        />
        {children}
      </BlurView>
    );
  }

  return (
    <View style={[styles.root, style, {backgroundColor: fallbackColor}]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
  },
});
