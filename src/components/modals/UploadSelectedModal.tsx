import {
  formatPhotoCount,
  formatStorageGb,
} from '@application/plan/formatPlanNumbers';
import {Modal, ProgressBar, TouchableOpacity} from '@components/ui';
import {
  resolveStorageProjectionState,
  type StorageProjectionState,
} from '@domain/plan';
import {bytesToGigabytes} from '@lib/culledAlbum/format';
import {colors} from '@lib/ui/colors';
import {fonts, sansBoldStyle} from '@lib/ui/typography';
import {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import IconCheckCircle from '../../assets/images/icon_check_circle.svg';
import IconInfo from '../../assets/images/icon_info.svg';
import CircleBlue from '../../assets/images/upload/blue_circle.svg';
import HalfCircle from '../../assets/images/upload/half_circle.svg';
import CircleLightBlue from '../../assets/images/upload/light_blue_circle.svg';
import QuarterCircleOrange from '../../assets/images/upload/orange_quarter_circle.svg';
import QuarterCircleRed from '../../assets/images/upload/red_quarter_circle.svg';

export type UploadSelectedPhase = 'confirm' | 'uploading' | 'complete';

type UploadSelectedModalProps = {
  visible: boolean;
  phase: UploadSelectedPhase;
  photoCount: number;
  storageUsedGb: number;
  storageLimitGb: number | null;
  uploadSizeGb: number;
  uploadedBytes?: number;
  totalUploadBytes?: number;
  uploadProgress?: number;
  isApplyingLook?: boolean;
  exportQualityLabel: string;
  onClose: () => void;
  onUploadNow: () => Promise<void>;
  onUpgradeStorage: () => void;
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

function formatQuota(usedGb: number, limitGb: number | null): string {
  if (limitGb == null) {
    return `${formatStorageGb(usedGb)} GB`;
  }
  return `${formatStorageGb(usedGb)} GB / ${formatStorageGb(limitGb)} GB`;
}

function StorageAlertBanner({
  variant,
}: {
  variant: Extract<StorageProjectionState, 'warning' | 'exceeded'>;
}) {
  const isExceeded = variant === 'exceeded';
  return (
    <View
      style={[
        styles.alertBanner,
        isExceeded ? styles.alertBannerExceeded : styles.alertBannerWarning,
      ]}>
      <IconInfo
        width={16}
        height={16}
        color={isExceeded ? colors.error : colors.accent}
      />
      <Text style={styles.alertMessage}>
        {isExceeded
          ? 'This upload would exceed your storage limit for this plan. Delete existing albums, reduce upload size, or upgrade storage to continue.'
          : "You'll be close to your storage limit after this upload"}
      </Text>
    </View>
  );
}

function StorageBreakdownCard({
  storageUsedGb,
  storageLimitGb,
  uploadSizeGb,
  projection,
}: {
  storageUsedGb: number;
  storageLimitGb: number | null;
  uploadSizeGb: number;
  projection: StorageProjectionState;
}) {
  const afterGb = storageUsedGb + uploadSizeGb;
  const progressPercent =
    storageLimitGb != null && storageLimitGb > 0
      ? (afterGb / storageLimitGb) * 100
      : 0;
  const isExceeded = projection === 'exceeded';
  const fillColor = isExceeded ? colors.error : colors.accent;

  return (
    <View style={styles.breakdown}>
      <View style={styles.breakdownRow}>
        <Text style={styles.breakdownLabel}>Current storage</Text>
        <Text style={styles.breakdownValue}>
          {formatQuota(storageUsedGb, storageLimitGb)}
        </Text>
      </View>
      <View style={styles.breakdownRow}>
        <Text style={styles.breakdownLabel}>This upload</Text>
        <Text style={styles.breakdownValue}>
          {formatStorageGb(uploadSizeGb)} GB
        </Text>
      </View>

      <View style={styles.usageSection}>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Storage after upload</Text>
          <Text
            style={[
              styles.breakdownValue,
              isExceeded && styles.breakdownValueExceeded,
            ]}>
            {formatQuota(afterGb, storageLimitGb)}
          </Text>
        </View>
        <View style={styles.storageProgressBar}>
          <View
            style={[
              styles.storageProgressFill,
              {
                width: `${Math.min(100, progressPercent)}%`,
                backgroundColor: fillColor,
              },
            ]}
          />
          {progressPercent > 100 && (
            <View
              style={[
                styles.storageProgressOverflow,
                {width: `${progressPercent - 100}%`},
              ]}
            />
          )}
        </View>
      </View>
    </View>
  );
}

function ConfirmPhase({
  photoCount,
  storageUsedGb,
  storageLimitGb,
  uploadSizeGb,
  exportQualityLabel,
  starting,
  onUploadNow,
  onUpgradeStorage,
  onCancel,
}: {
  photoCount: number;
  storageUsedGb: number;
  storageLimitGb: number | null;
  uploadSizeGb: number;
  exportQualityLabel: string;
  starting: boolean;
  onUploadNow: () => void;
  onUpgradeStorage: () => void;
  onCancel: () => void;
}) {
  const projection = resolveStorageProjectionState(
    storageUsedGb,
    uploadSizeGb,
    storageLimitGb,
  );
  const isExceeded = projection === 'exceeded';

  return (
    <View style={styles.container}>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>Upload Selected ({photoCount})</Text>
        <Text style={styles.subtitle}>
          These photos will be uploaded to your Gump cloud storage
        </Text>
      </View>

      <View style={styles.body}>
        <StorageBreakdownCard
          storageUsedGb={storageUsedGb}
          storageLimitGb={storageLimitGb}
          uploadSizeGb={uploadSizeGb}
          projection={projection}
        />

        {projection === 'warning' || projection === 'exceeded' ? (
          <StorageAlertBanner variant={projection} />
        ) : (
          <Text style={styles.exportHint}>
            Exports as{' '}
            <Text style={styles.exportHintEmphasis}>{exportQualityLabel}</Text>
          </Text>
        )}
      </View>

      <View style={styles.actions}>
        {isExceeded ? (
          <>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={onUpgradeStorage}
              activeOpacity={0.8}>
              <Text style={styles.primaryButtonText}>Upgrade storage</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancel}
              activeOpacity={0.7}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[
              styles.primaryButton,
              starting && styles.primaryButtonDisabled,
            ]}
            onPress={onUploadNow}
            disabled={starting}
            activeOpacity={0.8}>
            <Text style={styles.primaryButtonText}>
              {starting ? 'Starting...' : 'Upload Now'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
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
  const uploadedGb = bytesToGigabytes(uploadedBytes);
  const totalGb = bytesToGigabytes(totalUploadBytes);

  return (
    <View style={styles.uploadingContainer}>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>
          {isApplyingLook
            ? 'Applying look...'
            : `Uploading ${photoCount} Photo${photoCount === 1 ? '' : 's'}`}
        </Text>
        <Text style={styles.subtitle}>
          {isApplyingLook
            ? 'Baking looks onto your selected photos before upload.\nPlease keep this window open.'
            : 'Please keep this window open'}
        </Text>
      </View>

      <View style={styles.uploadProgressBlock}>
        <ProgressBar
          progress={uploadProgress}
          height={9}
          trackColor={colors.progressTrack}
          fillColor={colors.accent}
          style={styles.uploadProgressBar}
        />
        <Text style={styles.uploadProgressMeta}>
          <Text style={styles.uploadProgressMetaValue}>{percent}%</Text> · {formatStorageGb(uploadedGb)} GB of{' '}
          {formatStorageGb(totalGb)} GB
        </Text>
      </View>
    </View>
  );
}

function CompletePhase({
  photoCount,
  storageUsedGb,
  storageLimitGb,
  uploadSizeGb,
  onOpenAlbum,
}: {
  photoCount: number;
  storageUsedGb: number;
  storageLimitGb: number | null;
  uploadSizeGb: number;
  onOpenAlbum: () => void;
}) {
  const usedAfter = storageUsedGb + uploadSizeGb;
  const progress =
    storageLimitGb != null && storageLimitGb > 0
      ? Math.min(1, usedAfter / storageLimitGb)
      : 0;

  return (
    <View style={styles.container}>
      <View style={styles.completeHeader}>
        <IconCheckCircle width={48} height={48} color={colors.iconGreen} />
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Upload Complete</Text>
          <Text style={styles.subtitle}>
            {formatPhotoCount(photoCount)} photo
            {photoCount === 1 ? '' : 's'} uploaded
          </Text>
        </View>
      </View>

      <View style={styles.completeStorageCard}>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Storage used</Text>
          <Text style={styles.breakdownValue}>
            {storageLimitGb != null
              ? `${formatStorageGb(usedAfter)} / ${formatStorageGb(storageLimitGb)} GB`
              : `${formatStorageGb(usedAfter)} GB`}
          </Text>
        </View>
        <ProgressBar
          progress={progress}
          height={9}
          trackColor={colors.progressTrack}
          fillColor={colors.accent}
          style={styles.uploadProgressBar}
        />
      </View>

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={onOpenAlbum}
        activeOpacity={0.8}>
        <Text style={styles.primaryButtonText}>Open Album</Text>
      </TouchableOpacity>
    </View>
  );
}

function modalHeightForPhase(
  phase: UploadSelectedPhase,
  projection: StorageProjectionState,
): number {
  if (phase === 'uploading') {
    return 360;
  }
  if (phase === 'complete') {
    return 480;
  }
  if (projection === 'exceeded') {
    return 560;
  }
  if (projection === 'warning') {
    return 520;
  }
  return 520;
}

export function UploadSelectedModal({
  visible,
  phase,
  photoCount,
  storageUsedGb,
  storageLimitGb,
  uploadSizeGb,
  uploadedBytes = 0,
  totalUploadBytes = 0,
  uploadProgress = 0,
  isApplyingLook = false,
  exportQualityLabel,
  onClose,
  onUploadNow,
  onUpgradeStorage,
  onOpenAlbum,
}: UploadSelectedModalProps) {
  const [starting, setStarting] = useState(false);
  const projection = resolveStorageProjectionState(
    storageUsedGb,
    uploadSizeGb,
    storageLimitGb,
  );

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
      width={740}
      height={modalHeightForPhase(phase, projection)}
      contentStyle={styles.modalContent}>
      <ModalDecor />
      {phase === 'confirm' && (
        <ConfirmPhase
          photoCount={photoCount}
          storageUsedGb={storageUsedGb}
          storageLimitGb={storageLimitGb}
          uploadSizeGb={uploadSizeGb}
          exportQualityLabel={exportQualityLabel}
          starting={starting}
          onUploadNow={handleUploadNow}
          onUpgradeStorage={onUpgradeStorage}
          onCancel={onClose}
        />
      )}
      {phase === 'uploading' && (
        <UploadingPhase
          photoCount={photoCount}
          uploadProgress={uploadProgress}
          uploadedBytes={uploadedBytes}
          totalUploadBytes={totalUploadBytes}
          isApplyingLook={isApplyingLook}
        />
      )}
      {phase === 'complete' && (
        <CompletePhase
          photoCount={photoCount}
          storageUsedGb={storageUsedGb}
          storageLimitGb={storageLimitGb}
          uploadSizeGb={uploadSizeGb}
          onOpenAlbum={onOpenAlbum}
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
  container: {
    width: 480,
    maxWidth: '100%',
    gap: 24,
    alignItems: 'center',
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
  body: {
    width: '100%',
    gap: 16,
  },
  breakdown: {
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    padding: 24,
    gap: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownLabel: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textMuted,
  },
  breakdownValue: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textDark,
    fontWeight: 600,
  },
  breakdownValueExceeded: {
    color: colors.error,
  },
  usageSection: {
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: colors.borderLight,
  },
  storageProgressBar: {
    height: 9,
    backgroundColor: colors.progressTrack,
    borderRadius: 9999,
    overflow: 'hidden',
    position: 'relative',
  },
  storageProgressFill: {
    height: '100%',
    borderRadius: 9999,
  },
  storageProgressOverflow: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    backgroundColor: colors.error,
    opacity: 0.3,
    borderRadius: 9999,
  },
  exportHint: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  exportHintEmphasis: {
    ...sansBoldStyle,
    color: colors.textDark,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderLeftWidth: 5,
  },
  alertBannerWarning: {
    backgroundColor: '#FFF3E8',
    borderLeftColor: colors.accent,
  },
  alertBannerExceeded: {
    backgroundColor: '#FF6E5A1A',
    borderLeftColor: colors.error,
  },
  alertMessage: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 14 * 1.3,
    color: colors.textDark,
  },
  actions: {
    width: '100%',
    gap: 12,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 9999,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    alignSelf: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    ...sansBoldStyle,
    fontSize: 16,
    color: colors.white,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  cancelButtonText: {
    ...sansBoldStyle,
    fontSize: 16,
    color: colors.accent,
  },
  uploadProgressBlock: {
    width: '100%',
    gap: 12,
    alignItems: 'center',
  },
  uploadProgressBar: {
    width: '100%',
    borderRadius: 9999,
  },
  uploadProgressMeta: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  uploadProgressMetaValue: {
    fontWeight: 600,
  },
  completeHeader: {
    gap: 16,
    alignItems: 'center',
  },
  completeStorageCard: {
    width: '100%',
    borderWidth: 1,
    borderColor: colors.borderLight,
    borderRadius: 8,
    padding: 24,
    gap: 12,
  },
  halfCircleDecor: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  quarterOrangeDecor: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  quarterRedDecor: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  circleBlueDecor: {
    position: 'absolute',
    bottom: 24,
    left: 24,
  },
  circleLightBlueDecor: {
    position: 'absolute',
    top: 80,
    right: 0,
  },
});
