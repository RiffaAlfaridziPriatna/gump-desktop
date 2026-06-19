import {colors} from '@lib/colors';
import {useCallback, useEffect, useRef, useState} from 'react';
import {Image, StyleSheet, View} from 'react-native';

import type {FrostedViewProps} from './types';

const BACKDROP_BLUR_RADIUS = 24;

export function FrostedView({
  children,
  style,
  fallbackColor = colors.badge,
  backdrop,
  blurAmount = BACKDROP_BLUR_RADIUS,
  ...rest
}: FrostedViewProps) {
  const viewRef = useRef<View>(null);
  const [selfOrigin, setSelfOrigin] = useState<{x: number; y: number} | null>(null);
  const hasBlurBackdrop = Boolean(backdrop?.uri);

  const syncSelfOrigin = useCallback(() => {
    viewRef.current?.measureInWindow((x, y) => {
      setSelfOrigin({x, y});
    });
  }, []);

  useEffect(() => {
    if (hasBlurBackdrop) {
      syncSelfOrigin();
    }
  }, [hasBlurBackdrop, syncSelfOrigin]);

  return (
    <View
      ref={viewRef}
      style={[styles.root, style]}
      onLayout={hasBlurBackdrop ? syncSelfOrigin : undefined}
      {...rest}>
      {hasBlurBackdrop && backdrop && selfOrigin ? (
        <Image
          source={{uri: backdrop.uri}}
          blurRadius={blurAmount}
          resizeMode="cover"
          style={{
            position: 'absolute',
            width: backdrop.coverWidth,
            height: backdrop.coverHeight,
            left: backdrop.coverX - selfOrigin.x,
            top: backdrop.coverY - selfOrigin.y,
          }}
        />
      ) : null}
      <View
        pointerEvents="none"
        style={[styles.tint, {backgroundColor: fallbackColor}]}
      />
      <View style={styles.content}>{children}</View>
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
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
});
