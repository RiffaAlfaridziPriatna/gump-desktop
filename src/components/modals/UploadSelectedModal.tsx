import {formatPhotoCount} from '@application/plan/formatPlanNumbers';
import {Modal, ProgressBar, TouchableOpacity} from '@components/ui';
import {
  bytesToGigabytes,
  formatStorageSizeGb,
} from '@lib/culledAlbum/format';
import {colors} from '@lib/ui/colors';
import {fonts, sansBoldStyle} from '@lib/ui/typography';
import {useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import IconCheckCircle from '../../assets/images/icon_check_circle.svg';
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
  uploadSizeGb: number;
  uploadedBytes?: number;
  totalUploadBytes?: number;
  uploadProgress?: number;
  isApplyingLook?: boolean;
  exportQualityLabel: string;
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

function ConfirmPhase({
  photoCount,
  uploadSizeGb,
  exportQualityLabel,
  starting,
  onUploadNow,
}: {
  photoCount: number;
  uploadSizeGb: number;
  exportQualityLabel: string;
  starting: boolean;
  onUploadNow: () => void;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>Upload Selected ({photoCount})</Text>
        <Text style={styles.subtitle}>
          These photos will be uploaded to your Gump cloud storage
        </Text>
      </View>

      <View style={styles.body}>
        <View style={styles.breakdown}>
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Upload size</Text>
            <Text style={styles.breakdownValue}>
              {formatStorageSizeGb(uploadSizeGb)}
            </Text>
          </View>
        </View>

        <Text style={styles.exportHint}>
          Exports as{' '}
          <Text style={styles.exportHintEmphasis}>{exportQualityLabel}</Text>
        </Text>
      </View>

      <View style={styles.actions}>
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
          <Text style={styles.uploadProgressMetaValue}>{percent}%</Text> ·{' '}
          {formatStorageSizeGb(uploadedGb)} of {formatStorageSizeGb(totalGb)}
        </Text>
      </View>
    </View>
  );
}

function CompletePhase({
  photoCount,
  onOpenAlbum,
}: {
  photoCount: number;
  onOpenAlbum: () => void;
}) {
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

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={onOpenAlbum}
        activeOpacity={0.8}>
        <Text style={styles.primaryButtonText}>Open Album</Text>
      </TouchableOpacity>
    </View>
  );
}

function modalHeightForPhase(phase: UploadSelectedPhase): number {
  if (phase === 'uploading') {
    return 360;
  }
  if (phase === 'complete') {
    return 400;
  }
  return 440;
}

export function UploadSelectedModal({
  visible,
  phase,
  photoCount,
  uploadSizeGb,
  uploadedBytes = 0,
  totalUploadBytes = 0,
  uploadProgress = 0,
  isApplyingLook = false,
  exportQualityLabel,
  onClose,
  onUploadNow,
  onOpenAlbum,
}: UploadSelectedModalProps) {
  const [starting, setStarting] = useState(false);

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
      height={modalHeightForPhase(phase)}
      contentStyle={styles.modalContent}>
      <ModalDecor />
      {phase === 'confirm' && (
        <ConfirmPhase
          photoCount={photoCount}
          uploadSizeGb={uploadSizeGb}
          exportQualityLabel={exportQualityLabel}
          starting={starting}
          onUploadNow={handleUploadNow}
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
        <CompletePhase photoCount={photoCount} onOpenAlbum={onOpenAlbum} />
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
    width: '100%',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    ...sansBoldStyle,
    fontSize: 16,
    color: colors.white,
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
  completeHeader: {
    alignItems: 'center',
    gap: 16,
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
