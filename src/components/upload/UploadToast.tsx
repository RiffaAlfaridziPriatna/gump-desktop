import {ProgressBar} from '@components/ui';
import {UploadItem, useUploaderActions, useUploaderState} from '@context/uploader';
import {colors} from '@lib/colors';
import {fonts} from '@lib/typography';
import {useEffect, useMemo, useRef, useState} from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import IconClose from '../../assets/images/icon_close.svg';

const SLIDE_DISTANCE = 120;
const ANIMATION_MS = 220;
const AUTO_CLOSE_DELAY_MS = 5000;

export function UploadToast() {
  const deviceWidth = useWindowDimensions().width;

  const visible = useUploaderState(state => state.visible);
  const items = useUploaderState(state => state.uploads);
  const {hideToast, failNotUploadedItems, clearCompleted} = useUploaderActions();

  const shouldBeVisible = visible && items.length > 0;
  const [mounted, setMounted] = useState(shouldBeVisible);

  const translateY = useRef(new Animated.Value(SLIDE_DISTANCE)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const lastItemsRef = useRef<typeof items>([]);
  const shouldClearCompletedAfterCloseRef = useRef(false);
  if (items.length > 0) {
    lastItemsRef.current = items;
  }
  const renderItems = items.length > 0 ? items : lastItemsRef.current;

  const counts = useMemo(() => {
    const c = {pending: 0, uploaded: 0, uploading: 0, failed: 0};
    for (const item of renderItems) {
      c[item.status]++;
    }
    return c;
  }, [renderItems]);

  const completed =
    renderItems.length > 0 &&
    counts.uploaded + counts.failed >= renderItems.length;
  const totalProgress =
    renderItems.length > 0
      ? (counts.uploaded + counts.failed) / renderItems.length
      : 0;

  useEffect(() => {
    if (!visible || !completed || renderItems.length === 0) {
      return;
    }
    const timer = setTimeout(() => {
      shouldClearCompletedAfterCloseRef.current = true;
      hideToast();
    }, AUTO_CLOSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [completed, hideToast, renderItems.length, visible]);

  useEffect(() => {
    if (shouldBeVisible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: ANIMATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: ANIMATION_MS,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(translateY, {
        toValue: SLIDE_DISTANCE,
        duration: ANIMATION_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: ANIMATION_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(({finished}) => {
      if (finished) setMounted(false);
      if (finished && shouldClearCompletedAfterCloseRef.current) {
        shouldClearCompletedAfterCloseRef.current = false;
        clearCompleted();
      }
    });
  }, [clearCompleted, opacity, shouldBeVisible, translateY]);

  if (!mounted) {
    return null;
  }

  function handleClose() {
    if (!completed) {
      failNotUploadedItems('Upload cancelled');
    } else {
      shouldClearCompletedAfterCloseRef.current = true;
    }
    hideToast();
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {maxWidth: deviceWidth},
        {transform: [{translateY}], opacity},
      ]}>
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>
            {completed
              ? `Uploaded ${counts.uploaded} photos`
              : `Uploading ${renderItems.length} photos`}
          </Text>
          {completed && (
            <Text style={styles.completedText}>Completed</Text>
          )}
        </View>
        <TouchableOpacity
          onPress={handleClose}
          hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
          activeOpacity={0.7}
          style={styles.closeButton}>
          <IconClose width={12} height={12} color={colors.white} />
        </TouchableOpacity>
      </View>
      {!completed && <ProgressBar progress={totalProgress} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 450,
    backgroundColor: colors.white,
    zIndex: 100,
    paddingHorizontal: 32,
    paddingTop: 20,
    paddingBottom: 24,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  titleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    letterSpacing: 0,
    color: colors.textDark,
  },
  completedText: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.textDark,
  },
  closeButton: {
    width: 20,
    height: 20,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.textMuted,
  },
});
