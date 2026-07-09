import {
  forwardRef,
  PropsWithChildren,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

const useNativeDriver = Platform.OS !== 'windows';

const ENTER_DURATION_MS = 320;
const EXIT_DURATION_MS = 260;
const BACKDROP_OPACITY = 0.45;

export type ModalSlideEnterHandle = {
  slideOut: (onDone: () => void) => void;
};

type ModalSlideEnterProps = PropsWithChildren<{
  enabled?: boolean;
  instant?: boolean;
  onEnterComplete?: () => void;
}>;

export const ModalSlideEnter = forwardRef<
  ModalSlideEnterHandle,
  ModalSlideEnterProps
>(function ModalSlideEnter(
  {children, enabled = true, instant = false, onEnterComplete},
  ref,
) {
  const {height} = useWindowDimensions();
  const shouldAnimate = enabled && !instant;
  const translateY = useRef(
    new Animated.Value(shouldAnimate ? height : 0),
  ).current;
  const backdropOpacity = useRef(
    new Animated.Value(shouldAnimate ? 0 : BACKDROP_OPACITY),
  ).current;

  useImperativeHandle(
    ref,
    () => ({
      slideOut(onDone) {
        if (!enabled) {
          onDone();
          return;
        }

        Animated.parallel([
          Animated.timing(translateY, {
            toValue: height,
            duration: EXIT_DURATION_MS,
            easing: Easing.in(Easing.cubic),
            useNativeDriver,
          }),
          Animated.timing(backdropOpacity, {
            toValue: 0,
            duration: EXIT_DURATION_MS,
            easing: Easing.in(Easing.cubic),
            useNativeDriver,
          }),
        ]).start(() => {
          onDone();
        });
      },
    }),
    [backdropOpacity, enabled, height, translateY],
  );

  useLayoutEffect(() => {
    if (!enabled || instant) {
      onEnterComplete?.();
      return;
    }

    const animation = Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: ENTER_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver,
      }),
      Animated.timing(backdropOpacity, {
        toValue: BACKDROP_OPACITY,
        duration: ENTER_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver,
      }),
    ]);

    animation.start(({finished}) => {
      if (finished) {
        onEnterComplete?.();
      }
    });

    return () => {
      animation.stop();
    };
  }, [backdropOpacity, enabled, height, instant, onEnterComplete, translateY]);

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <View style={styles.root}>
      <Animated.View
        pointerEvents="none"
        style={[styles.backdrop, {opacity: backdropOpacity}]}
      />
      <Animated.View
        style={[styles.sheet, {transform: [{translateY}]}]}>
        {children}
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  sheet: {
    flex: 1,
  },
});
