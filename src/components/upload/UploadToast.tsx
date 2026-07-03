import {ProgressBar} from '@components/ui';
import {
  useCulledAlbumActions,
  useCulledAlbumAnalyzeItems,
  useCulledAlbumServerUploadBatch,
  useCulledAlbumUiState,
  useCulledAlbumUploadItems,
} from '@context/culledAlbum';
import {colors} from '@lib/colors';
import {fonts} from '@lib/typography';
import {computeServerUploadBatchProgress} from '@lib/culledAlbum/serverUploadProgress';
import {CulledAlbumPhoto} from '@lib/culledAlbum/types';
import {
  QueueToastMode,
  useAlbumQueueOperation,
} from '@lib/culledAlbum/uploadQueueStore';
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

type UploadToastProps = {
  mode?: QueueToastMode;
  albumId: string;
};

function countItems(photos: CulledAlbumPhoto[], mode: QueueToastMode) {
  const counts = {pending: 0, completed: 0, inProgress: 0, failed: 0};
  for (const photo of photos) {
    if (mode === 'upload') {
      if (photo.status === 'pending') counts.pending++;
      else if (photo.status === 'failed') counts.failed++;
      else if (photo.status === 'uploaded') counts.completed++;
      else counts.inProgress++;
      continue;
    }

    if (mode === 'analyze') {
      if (photo.analysisStatus === 'pending') counts.pending++;
      else if (photo.analysisStatus === 'failed') counts.failed++;
      else if (photo.analysisStatus === 'analyzed') counts.completed++;
      else if (photo.analysisStatus === 'analyzing') counts.inProgress++;
      continue;
    }

    if (photo.serverUploadStatus === 'pending') counts.pending++;
    else if (photo.serverUploadStatus === 'failed') counts.failed++;
    else if (photo.serverUploadStatus === 'uploaded') counts.completed++;
    else if (photo.serverUploadStatus === 'uploading') counts.inProgress++;
  }
  return counts;
}

export function UploadToast({mode = 'upload', albumId}: UploadToastProps) {
  const deviceWidth = useWindowDimensions().width;
  const queueOperation = useAlbumQueueOperation(albumId, mode);
  const analyzeError = useCulledAlbumUiState(state => state.analyzeError);

  const uploadItems = useCulledAlbumUploadItems(
    mode === 'upload' ? albumId : null,
  );
  const analyzeItems = useCulledAlbumAnalyzeItems(
    mode === 'analyze' ? albumId : null,
  );
  const {batchPhotoIds: serverBatchPhotoIds, photos: serverUploadItems} =
    useCulledAlbumServerUploadBatch(albumId);

  const {
    hideToast,
    failNotUploadedItems,
    failNotAnalyzedItems,
    clearCompleted,
  } = useCulledAlbumActions();

  const items =
    mode === 'upload'
      ? uploadItems
      : mode === 'analyze'
        ? analyzeItems
        : serverUploadItems;

  const visible =
    queueOperation.status === 'active' ||
    ((queueOperation.status === 'completed' ||
      queueOperation.status === 'failed') &&
      !queueOperation.completionSeen);
  const shouldBeVisible = visible && items.length > 0;
  const [mounted, setMounted] = useState(false);

  const translateY = useRef(new Animated.Value(SLIDE_DISTANCE)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const wasVisibleRef = useRef(false);

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
  const totalProgress = useMemo(() => {
    if (mode === 'serverUpload') {
      return computeServerUploadBatchProgress(renderItems, serverBatchPhotoIds);
    }

    const totalItems = renderItems.length;
    if (totalItems === 0) {
      return 0;
    }
    const progressCount = counts.pending + counts.inProgress;
    const progressRatio = progressCount / totalItems;
    return 1 - +progressRatio.toFixed(2);
  }, [counts, mode, renderItems, serverBatchPhotoIds]);

  const inProgressLabel =
    mode === 'upload'
      ? `Uploading ${counts.pending + counts.inProgress} photos`
      : mode === 'analyze'
        ? `Analyzing ${counts.pending + counts.inProgress} photos`
        : `Uploading ${counts.pending + counts.inProgress} photos to server`;
  const completedLabel =
    mode === 'upload'
      ? `Uploaded ${counts.completed} photos`
      : mode === 'analyze'
        ? allAnalyzeFailed
          ? `Failed to analyze ${counts.failed} photo${counts.failed === 1 ? '' : 's'}`
          : `Culled ${counts.completed} photos`
        : `Uploaded ${counts.completed} photos to server`;

  useEffect(() => {
    if (!visible || !completed || renderItems.length === 0) {
      return;
    }
    const timer = setTimeout(() => {
      shouldClearCompletedAfterCloseRef.current = true;
      hideToast(mode, albumId);
    }, AUTO_CLOSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [albumId, completed, hideToast, mode, renderItems.length, visible]);

  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = shouldBeVisible;

    if (shouldBeVisible && !wasVisible) {
      setMounted(true);
      translateY.setValue(SLIDE_DISTANCE);
      opacity.setValue(0);
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

    if (!shouldBeVisible && wasVisible) {
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
        if (finished) {
          setMounted(false);
        }
        if (finished && shouldClearCompletedAfterCloseRef.current) {
          shouldClearCompletedAfterCloseRef.current = false;
          clearCompleted(mode, albumId);
        }
      });
    }
  }, [albumId, clearCompleted, mode, opacity, shouldBeVisible, translateY]);

  if (!mounted) {
    return null;
  }

  function handleClose() {
    if (!completed) {
      if (mode === 'upload') {
        failNotUploadedItems(albumId, 'Upload cancelled');
      } else if (mode === 'analyze') {
        failNotAnalyzedItems(albumId, 'Analysis cancelled');
      }
    } else {
      shouldClearCompletedAfterCloseRef.current = true;
    }
    hideToast(mode, albumId);
  }

  const showCompletedBadge =
    completed && !allAnalyzeFailed && queueOperation.status === 'completed';

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
          {showCompletedBadge && (
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
