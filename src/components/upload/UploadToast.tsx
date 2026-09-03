import { ProgressBar, TouchableOpacity } from '@components/ui';
import {
  useCulledAlbumActions,
  useCulledAlbumAnalysisCounts,
  useCulledAlbumLocalImportProgress,
  useCulledAlbumServerUploadBatch,
  useCulledAlbumUiState,
} from '@context/culledAlbum';
import { computeLocalImportBatchProgress } from '@lib/culledAlbum/localImportProgress';
import { computeServerUploadBatchProgress } from '@lib/culledAlbum/serverUploadProgress';
import { CulledAlbumPhoto, LocalImportBatchCounts } from '@lib/culledAlbum/types';
import {
  QueueToastMode,
  useAlbumQueueOperation,
} from '@lib/culledAlbum/uploadQueueStore';
import { colors } from '@lib/ui/colors';
import { fonts, sansBoldStyle } from '@lib/ui/typography';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import IconClose from '../../assets/images/icon_close.svg';

const useNativeDriver = Platform.OS !== 'windows';

const SLIDE_DISTANCE = 120;
const ANIMATION_MS = 220;
const AUTO_CLOSE_DELAY_MS = 5000;
const MIN_MS_PER_PHOTO = 80;
const MAX_MS_PER_PHOTO = 350;
const DEFAULT_MS_PER_PHOTO = 180;
const MAX_LEAD_PHOTOS = 20;

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function useInterpolatedRemaining(
  enabled: boolean,
  targetRemaining: number,
  shouldSnap: boolean,
  resetKey: string,
  batchTotal: number,
): number {
  const [displayedRemaining, setDisplayedRemaining] = useState(targetRemaining);
  const displayedRef = useRef(targetRemaining);
  const targetRef = useRef(targetRemaining);
  const resetKeyRef = useRef(resetKey);
  const msPerPhotoRef = useRef(DEFAULT_MS_PER_PHOTO);
  const lastNativeTargetRef = useRef(targetRemaining);
  const lastNativeAtRef = useRef(0);
  const lastNativeGapRef = useRef(MAX_LEAD_PHOTOS);

  targetRef.current = Math.max(0, Math.round(targetRemaining));

  useEffect(() => {
    const clampedTarget = targetRef.current;
    const didReset = resetKeyRef.current !== resetKey;
    resetKeyRef.current = resetKey;

    if (didReset || displayedRef.current < clampedTarget) {
      lastNativeTargetRef.current = clampedTarget;
      lastNativeAtRef.current = 0;
      lastNativeGapRef.current = MAX_LEAD_PHOTOS;
      msPerPhotoRef.current = DEFAULT_MS_PER_PHOTO;
      displayedRef.current = clampedTarget;
      setDisplayedRemaining(clampedTarget);
      return;
    }

    if (lastNativeTargetRef.current > clampedTarget) {
      const gap = lastNativeTargetRef.current - clampedTarget;
      const elapsed = Date.now() - lastNativeAtRef.current;
      if (gap > 0 && lastNativeAtRef.current > 0 && elapsed > 250) {
        msPerPhotoRef.current = clampNumber(
          elapsed / gap,
          MIN_MS_PER_PHOTO,
          MAX_MS_PER_PHOTO,
        );
        lastNativeGapRef.current = gap;
      }
    }

    lastNativeTargetRef.current = clampedTarget;
    lastNativeAtRef.current = Date.now();
  }, [resetKey, targetRemaining]);

  useEffect(() => {
    if (!enabled || shouldSnap) {
      displayedRef.current = targetRef.current;
      setDisplayedRemaining(targetRef.current);
      return;
    }

    if (batchTotal > 0 && displayedRef.current > batchTotal) {
      displayedRef.current = batchTotal;
      setDisplayedRemaining(batchTotal);
    }

    let accumulatedMs = 0;
    let lastNow = 0;
    let frameId = 0;

    const tick = (now: number) => {
      if (lastNow === 0) {
        lastNow = now;
      }
      accumulatedMs += Math.min(50, now - lastNow);
      lastNow = now;

      const nativeRemaining = targetRef.current;
      const lead = lastNativeGapRef.current;
      const floor =
        nativeRemaining > lead
          ? nativeRemaining - lead
          : nativeRemaining;
      let current = displayedRef.current;
      if (batchTotal > 0 && current > batchTotal) {
        current = batchTotal;
      }

      const goal = current > nativeRemaining ? nativeRemaining : floor;
      const stepMs = msPerPhotoRef.current;

      if (current > goal) {
        while (accumulatedMs >= stepMs && current > goal) {
          accumulatedMs -= stepMs;
          current -= 1;
        }
      } else {
        accumulatedMs = 0;
      }

      if (current !== displayedRef.current) {
        displayedRef.current = current;
        setDisplayedRemaining(current);
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [batchTotal, enabled, resetKey, shouldSnap]);

  if (!enabled) {
    return targetRemaining;
  }

  return displayedRemaining;
}

type UploadToastProps = {
  mode?: QueueToastMode;
  albumId: string;
};

type ItemCounts = {
  pending: number;
  completed: number;
  inProgress: number;
  failed: number;
};

function countsFromLocalImportProgress(
  progress: LocalImportBatchCounts,
): ItemCounts {
  return {
    pending: progress.pending,
    inProgress: progress.uploading,
    completed: progress.uploaded,
    failed: progress.failed,
  };
}

function countItems(photos: CulledAlbumPhoto[], mode: QueueToastMode): ItemCounts {
  const counts: ItemCounts = {pending: 0, completed: 0, inProgress: 0, failed: 0};
  for (const photo of photos) {
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

  const localImportProgress = useCulledAlbumLocalImportProgress(
    mode === 'upload' ? albumId : null,
  );
  const analysisCounts = useCulledAlbumAnalysisCounts(
    mode === 'analyze' ? albumId : null,
  );
  const {batchPhotoIds: serverBatchPhotoIds, photos: serverUploadItems} =
    useCulledAlbumServerUploadBatch(albumId);

  const {
    hideToast,
    requestCancelUpload,
    requestCancelAnalysis,
    failNotUploadedItems,
    failNotAnalyzedItems,
    clearCompleted,
  } = useCulledAlbumActions();

  const items = mode === 'serverUpload' ? serverUploadItems : [];

  const visible =
    queueOperation.status === 'active' ||
    queueOperation.status === 'finalizing' ||
    ((queueOperation.status === 'completed' ||
      queueOperation.status === 'failed') &&
      !queueOperation.completionSeen);

  const hasRenderableBatch =
    mode === 'upload'
      ? queueOperation.status !== 'idle' || queueOperation.batchTotal > 0
      : mode === 'analyze'
        ? (analysisCounts?.total ?? 0) > 0 || queueOperation.batchTotal > 0
        : items.length > 0;

  const shouldBeVisible = visible && hasRenderableBatch;
  const [mounted, setMounted] = useState(shouldBeVisible);
  const [isCanceling, setIsCanceling] = useState(false);
  const cancelSessionRef = useRef(0);
  const frozenProgressRef = useRef<number | null>(null);
  const lastAnalyzeRemainingRef = useRef<number | null>(null);

  const translateY = useRef(
    new Animated.Value(shouldBeVisible ? 0 : SLIDE_DISTANCE),
  ).current;
  const opacity = useRef(new Animated.Value(shouldBeVisible ? 1 : 0)).current;
  const wasVisibleRef = useRef(shouldBeVisible);
  const shouldClearCompletedAfterCloseRef = useRef(false);

  const lastItemsRef = useRef(items);
  const lastLocalImportProgressRef = useRef(localImportProgress);
  const lastAnalysisCountsRef = useRef(analysisCounts);
  if (items.length > 0) {
    lastItemsRef.current = items;
  }
  if (localImportProgress) {
    lastLocalImportProgressRef.current = localImportProgress;
  }
  if (analysisCounts && analysisCounts.total > 0) {
    lastAnalysisCountsRef.current = analysisCounts;
  }

  const renderItems = items.length > 0 ? items : lastItemsRef.current;
  const renderLocalImportProgress =
    localImportProgress ?? lastLocalImportProgressRef.current;
  const renderAnalysisCounts =
    analysisCounts && analysisCounts.total > 0
      ? analysisCounts
      : queueOperation.status === 'active' ||
          queueOperation.status === 'finalizing'
        ? lastAnalysisCountsRef.current
        : analysisCounts;

  const counts = useMemo(() => {
    if (mode === 'upload' && renderLocalImportProgress) {
      return countsFromLocalImportProgress(renderLocalImportProgress);
    }
    if (mode === 'analyze' && renderAnalysisCounts) {
      return {
        pending: renderAnalysisCounts.pending,
        inProgress: renderAnalysisCounts.inProgress,
        completed: renderAnalysisCounts.completed,
        failed: renderAnalysisCounts.failed,
      };
    }
    return countItems(renderItems, mode);
  }, [mode, renderAnalysisCounts, renderItems, renderLocalImportProgress]);

  const batchTotal =
    mode === 'upload'
      ? queueOperation.batchTotal
      : mode === 'analyze'
        ? Math.max(renderAnalysisCounts?.total ?? 0, queueOperation.batchTotal)
        : renderItems.length;

  const importFinished =
    mode === 'upload' &&
    (queueOperation.status === 'completed' || queueOperation.status === 'failed');
  const photosBatchDone =
    batchTotal > 0 && counts.completed + counts.failed >= batchTotal;
  const isFinalizingAnalysis =
    mode === 'analyze' &&
    photosBatchDone &&
    (queueOperation.status === 'active' ||
      queueOperation.status === 'finalizing');
  const completed =
    mode === 'upload'
      ? importFinished
      : mode === 'analyze'
        ? queueOperation.status === 'completed' ||
          (queueOperation.status === 'failed' && photosBatchDone)
        : photosBatchDone;
  const uploadCompletedCount =
    mode === 'upload' && importFinished
      ? queueOperation.uploadedCount
      : counts.completed;
  const uploadInProgressRemaining =
    mode === 'upload' && localImportProgress
      ? localImportProgress.pending + localImportProgress.uploading
      : counts.pending + counts.inProgress;
  const allAnalyzeFailed =
    mode === 'analyze' &&
    completed &&
    counts.completed === 0 &&
    counts.failed > 0;

  const analyzeRemaining = counts.pending + counts.inProgress;
  if (
    mode === 'analyze' &&
    (analyzeRemaining > 0 || counts.completed > 0 || counts.failed > 0)
  ) {
    lastAnalyzeRemainingRef.current = analyzeRemaining;
  }
  const targetAnalyzeRemaining =
    mode === 'analyze' &&
    analyzeRemaining === 0 &&
    counts.completed === 0 &&
    counts.failed === 0 &&
    queueOperation.status === 'active'
      ? lastAnalyzeRemainingRef.current && lastAnalyzeRemainingRef.current > 0
        ? lastAnalyzeRemainingRef.current
        : batchTotal
      : analyzeRemaining;

  const shouldSnapAnalyzeCount =
    isCanceling ||
    isFinalizingAnalysis ||
    completed ||
    queueOperation.status !== 'active';
  const displayAnalyzeRemaining = useInterpolatedRemaining(
    mode === 'analyze',
    targetAnalyzeRemaining,
    shouldSnapAnalyzeCount,
    `${albumId}:${queueOperation.status}:${queueOperation.batchTotal}`,
    batchTotal,
  );

  const totalProgress = useMemo(() => {
    if (mode === 'upload') {
      if (importFinished) {
        return 1;
      }
      if (localImportProgress) {
        return computeLocalImportBatchProgress(localImportProgress);
      }
      if (queueOperation.batchTotal === 0) {
        return 0;
      }
      const done = queueOperation.uploadedCount + queueOperation.failedCount;
      return done / queueOperation.batchTotal;
    }

    if (mode === 'serverUpload') {
      return computeServerUploadBatchProgress(renderItems, serverBatchPhotoIds);
    }

    if (isFinalizingAnalysis) {
      return 1;
    }

    if (batchTotal === 0) {
      return 0;
    }
    if (
      displayAnalyzeRemaining === 0 &&
      targetAnalyzeRemaining === 0 &&
      counts.completed === 0 &&
      counts.failed === 0
    ) {
      return 0;
    }
    return Math.min(
      1,
      Math.max(0, 1 - displayAnalyzeRemaining / batchTotal),
    );
  }, [
    batchTotal,
    counts.completed,
    counts.failed,
    displayAnalyzeRemaining,
    importFinished,
    isFinalizingAnalysis,
    localImportProgress,
    mode,
    queueOperation.batchTotal,
    queueOperation.failedCount,
    queueOperation.uploadedCount,
    renderItems,
    serverBatchPhotoIds,
    targetAnalyzeRemaining,
  ]);

  const displayProgress =
    isCanceling && frozenProgressRef.current !== null
      ? frozenProgressRef.current
      : totalProgress;

  const inProgressLabel = isCanceling
    ? mode === 'upload'
      ? 'Canceling upload...'
      : mode === 'analyze'
        ? 'Finalizing analysis...'
        : 'Canceling upload...'
    : mode === 'upload'
      ? `Uploading ${uploadInProgressRemaining} photos`
      : mode === 'analyze'
        ? isFinalizingAnalysis
          ? 'Finalizing analysis...'
          : `Analyzing ${displayAnalyzeRemaining} photos`
        : `Uploading ${counts.pending + counts.inProgress} photos to server`;
  const completedLabel =
    mode === 'upload'
      ? queueOperation.failedCount > 0
        ? `Uploaded ${uploadCompletedCount} out of ${queueOperation.batchTotal} photos`
        : `Uploaded ${uploadCompletedCount} photos`
      : mode === 'analyze'
        ? allAnalyzeFailed
          ? `Failed to analyze ${counts.failed} photo${counts.failed === 1 ? '' : 's'}`
          : `Culled ${counts.completed} photos`
        : `Uploaded ${counts.completed} photos to server`;

  useEffect(() => {
    if (!isCanceling) {
      return;
    }

    const session = cancelSessionRef.current;
    const timer = setTimeout(() => {
      const cancelWork =
        mode === 'upload'
          ? failNotUploadedItems(albumId, 'Upload cancelled')
          : mode === 'analyze'
            ? failNotAnalyzedItems(albumId, 'Analysis cancelled')
            : Promise.resolve();
      void cancelWork.finally(() => {
        if (cancelSessionRef.current !== session) {
          return;
        }
        frozenProgressRef.current = null;
        setIsCanceling(false);
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [
    albumId,
    failNotAnalyzedItems,
    failNotUploadedItems,
    isCanceling,
    mode,
  ]);

  useEffect(() => {
    if (!visible || !completed || batchTotal === 0 || isCanceling) {
      return;
    }
    const timer = setTimeout(() => {
      shouldClearCompletedAfterCloseRef.current = true;
      hideToast(mode, albumId);
    }, AUTO_CLOSE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [albumId, batchTotal, completed, hideToast, isCanceling, mode, visible]);

  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = shouldBeVisible;

    if (shouldBeVisible && !wasVisible) {
      setMounted(true);
      translateY.stopAnimation();
      opacity.stopAnimation();
      translateY.setValue(SLIDE_DISTANCE);
      opacity.setValue(1);
      Animated.timing(translateY, {
        toValue: 0,
        duration: ANIMATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver,
      }).start();
      return;
    }

    if (!shouldBeVisible && wasVisible) {
      if (!queueOperation.completionSeen) {
        wasVisibleRef.current = true;
        return;
      }

      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SLIDE_DISTANCE,
          duration: ANIMATION_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: ANIMATION_MS,
          easing: Easing.in(Easing.cubic),
          useNativeDriver,
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
  }, [albumId, clearCompleted, mode, opacity, queueOperation.completionSeen, shouldBeVisible, translateY]);

  if (!mounted) {
    return null;
  }

  function handleClose() {
    if (isCanceling) {
      return;
    }

    if (!completed && (mode === 'upload' || mode === 'analyze')) {
      if (mode === 'upload') {
        requestCancelUpload(albumId);
        frozenProgressRef.current = totalProgress;
      } else {
        requestCancelAnalysis(albumId);
        frozenProgressRef.current = 1;
      }
      cancelSessionRef.current += 1;
      setIsCanceling(true);
      return;
    }

    shouldClearCompletedAfterCloseRef.current = true;
    hideToast(mode, albumId);
  }

  const showCompletedBadge =
    completed &&
    !isCanceling &&
    !allAnalyzeFailed &&
    (mode === 'upload'
      ? queueOperation.status === 'completed'
      : queueOperation.status === 'completed');

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
            {completed && !isCanceling ? completedLabel : inProgressLabel}
          </Text>
          {showCompletedBadge && (
            <Text style={styles.completedText}>Completed</Text>
          )}
        </View>
        {!isCanceling ? (
          <TouchableOpacity
            onPress={handleClose}
            hitSlop={{top: 8, bottom: 8, left: 8, right: 8}}
            activeOpacity={0.7}
            style={styles.closeButton}>
            <IconClose width={12} height={12} color={colors.white} />
          </TouchableOpacity>
        ) : null}
      </View>
      {allAnalyzeFailed && analyzeError ? (
        <Text style={styles.errorText}>{analyzeError}</Text>
      ) : null}
      {!completed || isCanceling ? (
        <View collapsable={false} style={styles.progressBarContainer}>
          <ProgressBar progress={displayProgress} />
        </View>
      ) : null}
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
    ...sansBoldStyle,
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
  progressBarContainer: {
    width: '100%',
    alignSelf: 'stretch',
  },
});
