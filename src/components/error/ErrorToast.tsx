import {useEffect, useRef} from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useErrorState, useErrorActions} from '@context/error';
import {colors} from '@lib/colors';
import {fonts} from '@lib/typography';

const TOAST_DURATION = 5000;

export function ErrorToast() {
  const error = useErrorState(state => state.error);
  const visible = useErrorState(state => state.visible);
  const {hideError, clearError} = useErrorActions();
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible && error) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();

      const timer = setTimeout(() => {
        handleHide();
      }, TOAST_DURATION);

      return () => clearTimeout(timer);
    }
  }, [visible, error?.id]);

  function handleHide() {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      clearError();
    });
  }

  if (!error) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{translateY}],
          opacity,
        },
      ]}>
      <View style={styles.content}>
        <View style={styles.textContainer}>
          {error.code && <Text style={styles.code}>{error.code}</Text>}
          <Text style={styles.message} numberOfLines={2}>
            {error.message}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={handleHide}
          activeOpacity={0.7}>
          <Text style={styles.dismissText}>Dismiss</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 48,
    right: 48,
    zIndex: 1000,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.error,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  textContainer: {
    flex: 1,
    gap: 4,
  },
  code: {
    fontFamily: fonts.sansBold,
    fontSize: 12,
    color: colors.white,
    opacity: 0.8,
    textTransform: 'uppercase',
  },
  message: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.white,
    lineHeight: 20,
  },
  dismissButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
  },
  dismissText: {
    fontFamily: fonts.sansBold,
    fontSize: 12,
    color: colors.white,
  },
});
