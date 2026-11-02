import {Modal, ProgressBar} from '@components/ui';
import {useCloudStoragePreflight} from '@hooks/useCloudStoragePreflight';
import {useUploadFailureSummary} from '@hooks/useUploadFailureSummary';
import {
  bytesToGigabytes,
  formatStorageSizeGb,
} from '@lib/culledAlbum/format';
import {openUpgradePlan} from '@lib/plan/billingLinks';
import {reportError} from '@lib/observability/reportError';
import {colors} from '@lib/ui/colors';
import {fonts, sansBoldStyle} from '@lib/ui/typography';
import {useEffect, useState} from 'react';
import {AccessibilityInfo, StyleSheet, Text, View} from 'react-native';
import {UploadCloudStorageView} from './UploadCloudStorageView';
import {UploadCompleteView} from './UploadCompleteView';
import {UploadBakeDiskFull, UploadFailureFlow} from './UploadFailureFlow';
import CircleBlue from '../../assets/images/upload/blue_circle.svg';
import HalfCircle from '../../assets/images/upload/half_circle.svg';
import CircleLightBlue from '../../assets/images/upload/light_blue_circle.svg';
import QuarterCircleOrange from '../../assets/images/upload/orange_quarter_circle.svg';
import QuarterCircleRed from '../../assets/images/upload/red_quarter_circle.svg';

export type UploadSelectedPhase = 'confirm' | 'uploading' | 'complete';

type UploadSelectedModalProps = {
  visible: boolean;
  albumId: string;
  phase: UploadSelectedPhase;
  photoCount: number;
  uploadSizeGb: number;
  uploadedBytes?: number;
  totalUploadBytes?: number;
  uploadProgress?: number;
  isApplyingLook?: boolean;
  /** Set when applying looks failed for lack of disk space. */
  bakeDiskFull?: {requiredBytes?: number};
  onClose: () => void;
  onUploadNow: () => Promise<void>;
  onOpenAlbum: () => void;
};

function ModalDecor() {
  return (
    <>
      <HalfCircle style={styles.halfCircleDecor} width={72} />
      <QuarterCircleOrange
        style={styles.quarterOrangeDecor}
        width={98}
        height={98}
      />
      <QuarterCircleRed style={styles.quarterRedDecor} width={80} height={80} />
      <CircleBlue style={styles.circleBlueDecor} width={32} height={32} />
      <CircleLightBlue
        style={styles.circleLightBlueDecor}
        width={36}
        height={36}
      />
    </>
  );
}

function UploadingPhase({
  photoCount,
  uploadProgress,
  uploadedBytes,
  totalUploadBytes,
  isApplyingLook,
}: {
  photoCount: number;
  uploadProgress: number;
  uploadedBytes: number;
  totalUploadBytes: number;
  isApplyingLook: boolean;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, uploadProgress)) * 100);
  const title = isApplyingLook
    ? 'Applying look...'
    : `Uploading ${photoCount} Photo${photoCount === 1 ? '' : 's'}`;
  const subtitle = isApplyingLook
    ? 'Baking looks onto your selected photos before upload.\nPlease keep this window open.'
    : 'Please keep this window open';
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${title}. ${subtitle}`);
  }, [title, subtitle]);
  const uploadedGb = bytesToGigabytes(uploadedBytes);
  const totalGb = bytesToGigabytes(totalUploadBytes);

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
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Upload progress"
          accessibilityValue={{
            min: 0,
            max: 100,
            now: percent,
            text: `${percent}%, ${formatStorageSizeGb(
              uploadedGb,
            )} of ${formatStorageSizeGb(totalGb)}`,
          }}>
          <ProgressBar
            progress={uploadProgress}
            height={9}
            trackColor={colors.progressTrack}
            fillColor={colors.accent}
            style={styles.uploadProgressBar}
          />
        </View>
        <Text style={styles.uploadProgressMeta}>
          <Text style={styles.uploadProgressMetaValue}>{percent}%</Text> ·{' '}
          {formatStorageSizeGb(uploadedGb)} of {formatStorageSizeGb(totalGb)}
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
    return 360;
  }
  return isExceeded ? 495 : 456;
}

export function UploadSelectedModal({
  visible,
  albumId,
  phase,
  photoCount,
  uploadSizeGb,
  uploadedBytes = 0,
  totalUploadBytes = 0,
  uploadProgress = 0,
  isApplyingLook = false,
  bakeDiskFull,
  onClose,
  onUploadNow,
  onOpenAlbum,
}: UploadSelectedModalProps) {
  const [starting, setStarting] = useState(false);
  const failures = useUploadFailureSummary(albumId);
  const hasFailures =
    failures.retryable + failures.quota + failures.final > 0;
  const {preflight, retry} = useCloudStoragePreflight(
    visible && phase !== 'uploading',
    phase === 'complete' ? failures.retryBytes : uploadSizeGb * 1024 ** 3,
  );

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
      <ModalDecor />
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
        />
      )}
      {phase === 'uploading' && !bakeDiskFull && (
        <UploadingPhase
          photoCount={photoCount}
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
    gap: 32,
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
    lineHeight: 16 * 1.4,
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
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  uploadProgressMetaValue: {
    ...sansBoldStyle,
    color: colors.textDark,
  },
  halfCircleDecor: {
    position: 'absolute',
    top: -20,
    left: -28,
  },
  quarterOrangeDecor: {
    position: 'absolute',
    top: -24,
    right: -20,
  },
  quarterRedDecor: {
    position: 'absolute',
    bottom: -18,
    right: -10,
  },
  circleBlueDecor: {
    position: 'absolute',
    bottom: 48,
    left: 18,
  },
  circleLightBlueDecor: {
    position: 'absolute',
    top: 72,
    right: 28,
  },
});
