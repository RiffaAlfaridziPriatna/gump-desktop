import {ProgressBar} from '@components/ui';
import {
  useCulledAlbumActions,
  useCulledAlbumAnalyzeItems,
  useCulledAlbumUiState,
  useCulledAlbumUploadItems,
} from '@context/culledAlbum';
import {colors} from '@lib/colors';
import {fonts} from '@lib/typography';
import {CulledAlbumPhoto} from '@lib/culledAlbum/types';
import {useEffect, useMemo, useRef, useState} from 'react';
import {TouchableOpacity} from '@components/ui';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import IconClose from '../../assets/images/icon_close.svg';

const SLIDE_DISTANCE = 120;
const ANIMATION_MS = 220;
const AUTO_CLOSE_DELAY_MS = 5000;

type ToastMode = 'upload' | 'analyze';

type UploadToastProps = {
  mode?: ToastMode;
};

function itemProgress(photo: CulledAlbumPhoto, mode: ToastMode): number {
  if (mode === 'upload') {
    if (photo.status === 'uploaded' || photo.status === 'failed') {
      return 1;
    }
    if (photo.status === 'uploading') {
      return Math.max(0.05, photo.progress / 100);
    }
    return 0;
  }

  if (photo.analysisStatus === 'analyzed' || photo.analysisStatus === 'failed') {
    return 1;
  }
  if (photo.analysisStatus === 'analyzing') {
    return Math.max(0.05, photo.analysisProgress / 100);
  }
  return 0;
}

function countItems(photos: CulledAlbumPhoto[], mode: ToastMode) {
  const counts = {pending: 0, completed: 0, inProgress: 0, failed: 0};
  for (const photo of photos) {
    if (mode === 'upload') {
      if (photo.status === 'pending') counts.pending++;
      else if (photo.status === 'failed') counts.failed++;
      else if (photo.status === 'uploaded') counts.completed++;
      else counts.inProgress++;
      continue;
    }

    if (photo.analysisStatus === 'pending') counts.pending++;
    else if (photo.analysisStatus === 'failed') counts.failed++;
    else if (photo.analysisStatus === 'analyzed') counts.completed++;
    else if (photo.analysisStatus === 'analyzing') counts.inProgress++;
  }
  return counts;
}

export function UploadToast({mode = 'upload'}: UploadToastProps) {
  const deviceWidth = useWindowDimensions().width;

  const uploadVisible = useCulledAlbumUiState(state => state.uploadVisible);
  const analyzeVisible = useCulledAlbumUiState(state => state.analyzeVisible);
  const activeUploadAlbumId = useCulledAlbumUiState(
    state => state.activeUploadAlbumId,
  );
  const activeAnalyzeAlbumId = useCulledAlbumUiState(
    state => state.activeAnalyzeAlbumId,
  );
  const analyzeError = useCulledAlbumUiState(state => state.analyzeError);

  const uploadItems = useCulledAlbumUploadItems(activeUploadAlbumId);
  const analyzeItems = useCulledAlbumAnalyzeItems(activeAnalyzeAlbumId);

  const {
    hideToast,
    failNotUploadedItems,
    failNotAnalyzedItems,
    clearCompleted,
  } = useCulledAlbumActions();

  const visible = mode === 'upload' ? uploadVisible : analyzeVisible;
  const items = mode === 'upload' ? uploadItems : analyzeItems;

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

  const counts = useMemo(
    () => countItems(renderItems, mode),
    [mode, renderItems],
  );

  const completed =
    renderItems.length > 0 &&
    counts.completed + counts.failed >= renderItems.length;
  const allAnalyzeFailed =
    mode === 'analyze' &&
    completed &&
    counts.completed === 0 &&
    counts.failed > 0;
  const totalProgress =
    renderItems.length > 0
      ? renderItems.reduce(
          (sum, photo) => sum + itemProgress(photo, mode),
          0,
        ) / renderItems.length
      : 0;

  const inProgressLabel =
    mode === 'upload'
      ? `Uploading ${renderItems.length} photos`
      : `Analyzing ${renderItems.length} photos`;
  const completedLabel =
    mode === 'upload'
      ? `Uploaded ${counts.completed} photos`
      : allAnalyzeFailed
        ? `Failed to analyze ${counts.failed} photo${counts.failed === 1 ? '' : 's'}`
        : `Culled ${counts.completed} photos`;

  useEffect(() => {
    if (!visible || !completed || renderItems.length === 0) {
      return;
    }
    const timer = setTimeout(() => {
      shouldClearCompletedAfterCloseRef.current = true;
      hideToast(mode);
    }, AUTO_CLOSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [completed, hideToast, mode, renderItems.length, visible]);

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
        clearCompleted(mode);
      }
    });
  }, [clearCompleted, mode, opacity, shouldBeVisible, translateY]);

  if (!mounted) {
    return null;
  }

  function handleClose() {
    if (!completed) {
      if (mode === 'upload') {
        failNotUploadedItems('Upload cancelled');
      } else {
        failNotAnalyzedItems('Analysis cancelled');
      }
    } else {
      shouldClearCompletedAfterCloseRef.current = true;
    }
    hideToast(mode);
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
            {completed ? completedLabel : inProgressLabel}
          </Text>
          {completed && !allAnalyzeFailed && (
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
      {allAnalyzeFailed && analyzeError ? (
        <Text style={styles.errorText}>{analyzeError}</Text>
      ) : null}
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
  errorText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.error,
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
