import {Modal, ProgressBar} from '@components/ui';
import {useCloudStoragePreflight} from '@hooks/useCloudStoragePreflight';
import {
  useUploadFailureSummary,
  type UploadFailureSummary,
} from '@hooks/useUploadFailureSummary';
import type {CloudStoragePreflight} from '@lib/culledAlbum/uploadPreflight';
import {formatGigabytes} from '@lib/export/formatByteSize';
import {openUpgradePlan} from '@lib/plan/billingLinks';
import {reportError} from '@lib/observability/reportError';
import {colors} from '@lib/ui/colors';
import {fonts, sansMediumStyle} from '@lib/ui/typography';
import {useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, StyleSheet, Text, View} from 'react-native';
import {UploadCloudStorageView} from './UploadCloudStorageView';
import {focusDesktopNode} from './focusDesktopNode';
import {ModalDecorations} from './ModalDecorations';
import {UploadCompleteView} from './UploadCompleteView';
import {UploadBakeDiskFull, UploadFailureFlow} from './UploadFailureFlow';

export type UploadSelectedPhase = 'confirm' | 'uploading' | 'complete';

type UploadSelectedModalProps = {
  visible: boolean;
  albumId: string;
  phase: UploadSelectedPhase;
  photoCount: number;
  /** Photos of this upload already on the server. */
  uploadedCount?: number;
  uploadSizeGb: number;
  uploadedBytes?: number;
  totalUploadBytes?: number;
  uploadProgress?: number;
  isApplyingLook?: boolean;
  /** Set when applying looks failed for lack of disk space. */
  bakeDiskFull?: {requiredBytes?: number};
  /** Figma visual-review overrides; skips live preflight/failure hooks. */
  reviewPreflight?: CloudStoragePreflight;
  reviewFailures?: UploadFailureSummary;
  onClose: () => void;
  onUploadNow: () => Promise<void>;
  onOpenAlbum: () => void;
  /** Switch the owner's phase to 'uploading' after a retry starts. */
  onRetryStarted: () => void;
};

function UploadingPhase({
  photoCount,
  uploadedCount,
  uploadProgress,
  uploadedBytes,
  totalUploadBytes,
  isApplyingLook,
}: {
  photoCount: number;
  uploadedCount: number;
  uploadProgress: number;
  uploadedBytes: number;
  totalUploadBytes: number;
  isApplyingLook: boolean;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, uploadProgress)) * 100);
  const title = isApplyingLook
    ? 'Applying look...'
    : `Uploading ${photoCount} photo${photoCount === 1 ? '' : 's'}`;
  const subtitle = isApplyingLook
    ? 'Baking looks onto your selected photos before upload.\nPlease keep this window open.'
    : 'Please keep this window open';
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${title}. ${subtitle}`);
  }, [title, subtitle]);
  const progressRef = useRef<View | null>(null);
  useEffect(() => {
    focusDesktopNode(progressRef.current);
  }, []);
  const sizes = `${formatGigabytes(uploadedBytes)} of ${formatGigabytes(
    totalUploadBytes,
  )}`;

  return (
    <View style={styles.uploadingContainer}>
      <View style={styles.titleBlock}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      <View style={styles.uploadProgressBlock}>
        <View
          ref={progressRef}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Upload progress"
          accessibilityValue={{
            min: 0,
            max: 100,
            now: percent,
            text: `${percent}%, ${sizes}`,
          }}
          enableFocusRing={false}>
          <ProgressBar
            progress={uploadProgress}
            height={9}
            trackColor={colors.progressTrack}
            fillColor={colors.accent}
            style={styles.uploadProgressBar}
          />
        </View>
        <Text style={styles.uploadProgressMeta}>
          {`${uploadedCount} of ${photoCount} photo${
            photoCount === 1 ? '' : 's'
          } · ${sizes}`}
        </Text>
      </View>
    </View>
  );
}

function modalHeightForPhase(
  phase: UploadSelectedPhase,
  isExceeded: boolean,
): number {
  if (phase === 'uploading') {
    return 456;
  }
  return isExceeded ? 511 : 456;
}

export function UploadSelectedModal({
  visible,
  albumId,
  phase,
  photoCount,
  uploadedCount = 0,
  uploadSizeGb,
  uploadedBytes = 0,
  totalUploadBytes = 0,
  uploadProgress = 0,
  isApplyingLook = false,
  bakeDiskFull,
  reviewPreflight,
  reviewFailures,
  onClose,
  onUploadNow,
  onOpenAlbum,
  onRetryStarted,
}: UploadSelectedModalProps) {
  const [starting, setStarting] = useState(false);
  const liveFailures = useUploadFailureSummary(albumId);
  const failures = reviewFailures ?? liveFailures;
  const hasFailures =
    failures.retryable + failures.quota + failures.final > 0;
  const {preflight: livePreflight, retry} = useCloudStoragePreflight(
    visible && phase !== 'uploading' && reviewPreflight == null,
    phase === 'complete' ? failures.retryBytes : uploadSizeGb * 1024 ** 3,
  );
  const preflight = reviewPreflight ?? livePreflight;

  async function handleViewCloudPlans() {
    try {
      await openUpgradePlan();
    } catch (error) {
      reportError(error, {source: 'upload_modal', operation: 'openUpgradePlan'});
    }
  }

  async function handleUploadNow() {
    if (starting) {
      return;
    }
    setStarting(true);
    try {
      await onUploadNow();
    } catch (error) {
      console.error('[UploadSelectedModal] Failed to start upload', error);
    } finally {
      setStarting(false);
    }
  }

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      width={720}
      height={modalHeightForPhase(
        phase,
        preflight.status === 'exceeded' &&
          (phase === 'confirm' || failures.quota > 0),
      )}
      contentStyle={styles.modalContent}>
      <ModalDecorations />
      {phase === 'confirm' && (
        <UploadCloudStorageView
          preflight={preflight}
          photoCount={photoCount}
          starting={starting}
          onUploadNow={handleUploadNow}
          onRetry={retry}
          onCancel={onClose}
          onViewCloudPlans={handleViewCloudPlans}
          onChooseFewer={onClose}
        />
      )}
      {phase === 'uploading' && bakeDiskFull && (
        <UploadBakeDiskFull
          albumId={albumId}
          requiredBytes={bakeDiskFull.requiredBytes ?? 0}
          onCancel={onClose}
          onRetryStarted={onRetryStarted}
        />
      )}
      {phase === 'uploading' && !bakeDiskFull && (
        <UploadingPhase
          photoCount={photoCount}
          uploadedCount={uploadedCount}
          uploadProgress={uploadProgress}
          uploadedBytes={uploadedBytes}
          totalUploadBytes={totalUploadBytes}
          isApplyingLook={isApplyingLook}
        />
      )}
      {phase === 'complete' && hasFailures && (
        <UploadFailureFlow
          albumId={albumId}
          summary={failures}
          preflight={preflight}
          onRetryPreflight={retry}
          onBackToAlbum={onOpenAlbum}
          onClose={onClose}
          onViewCloudPlans={handleViewCloudPlans}
          onRetryStarted={onRetryStarted}
        />
      )}
      {phase === 'complete' && !hasFailures && (
        <UploadCompleteView
          photoCount={photoCount}
          preflight={preflight}
          onBackToAlbum={onOpenAlbum}
        />
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    paddingHorizontal: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadingContainer: {
    width: 480,
    maxWidth: '100%',
    gap: 24,
    alignItems: 'center',
  },
  titleBlock: {
    gap: 12,
    alignItems: 'center',
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.textDark,
    textAlign: 'center',
    lineHeight: 28 * 1.2,
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 14 * 1.44,
    color: colors.textMuted,
    textAlign: 'center',
  },
  uploadProgressBlock: {
    width: '100%',
    gap: 12,
  },
  uploadProgressBar: {
    width: '100%',
  },
  uploadProgressMeta: {
    ...sansMediumStyle,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
