import { formatPhotoCount } from '@application/plan/formatPlanNumbers';
import { Modal, TouchableOpacity } from '@components/ui';
import { colors } from '@lib/ui/colors';
import { fonts, sansBoldStyle } from '@lib/ui/typography';
import { StyleSheet, Text, View } from 'react-native';
import IconInfo from '../../assets/images/icon_info.svg';
import CircleBlue from '../../assets/images/upload/blue_circle.svg';
import HalfCircle from '../../assets/images/upload/half_circle.svg';
import CircleLightBlue from '../../assets/images/upload/light_blue_circle.svg';
import QuarterCircleOrange from '../../assets/images/upload/orange_quarter_circle.svg';
import QuarterCircleRed from '../../assets/images/upload/red_quarter_circle.svg';

type CapacityExceededModalProps = {
  visible: boolean;
  photosLimit: number;
  photosUsed: number;
  albumPhotoCount: number;
  onAddCapacity: () => void;
  onCancel: () => void;
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

export function CapacityExceededModal({
  visible,
  photosLimit,
  photosUsed,
  albumPhotoCount,
  onAddCapacity,
  onCancel,
}: CapacityExceededModalProps) {
  const needed = photosUsed + albumPhotoCount;
  const progressPercent = photosLimit > 0 ? (needed / photosLimit) * 100 : 0;

  return (
    <Modal
      visible={visible}
      onClose={onCancel}
      width={740}
      height={560}
      contentStyle={styles.modalContent}
    >
      <ModalDecor />
      <View style={styles.container}>
        <Text style={styles.title}>
          Not enough processing capacity{'\n'}for this album
        </Text>

        <View style={styles.body}>
          <View style={styles.breakdown}>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Your plan includes</Text>
              <Text style={styles.breakdownValue}>
                {formatPhotoCount(photosLimit)} photos
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>
                You've already processed
              </Text>
              <Text style={styles.breakdownValue}>
                {formatPhotoCount(photosUsed)} photos
              </Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>This album would add</Text>
              <Text style={styles.breakdownValue}>
                +{formatPhotoCount(albumPhotoCount)} photos
              </Text>
            </View>

            <View style={styles.usageSection}>
              <View style={styles.usageRow}>
                <Text style={styles.usageLabel}>
                  {formatPhotoCount(needed)} needed
                </Text>
                <Text style={styles.usageCapacity}>
                  {formatPhotoCount(photosLimit)} capacity
                </Text>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(100, progressPercent)}%` },
                  ]}
                />
                {progressPercent > 100 && (
                  <View
                    style={[
                      styles.progressOverflow,
                      { width: `${progressPercent - 100}%` },
                    ]}
                  />
                )}
              </View>
            </View>
          </View>

          <View style={styles.errorBanner}>
            <IconInfo width={16} height={16} color={colors.error} />
            <Text style={styles.errorMessage}>
              This exceeds your current capacity. Add capacity to continue
              culling.
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onAddCapacity}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>
              Add capacity & start culling
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={onCancel}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  container: {
    width: 480,
    maxWidth: '100%',
    gap: 24,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.textDark,
    textAlign: 'center',
    lineHeight: 28 * 1.2,
  },
  body: {
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
  usageSection: {
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: colors.borderLight,
  },
  usageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  usageLabel: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textMuted,
  },
  usageCapacity: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textMuted,
  },
  progressBar: {
    height: 9,
    backgroundColor: colors.progressTrack,
    borderRadius: 9999,
    overflow: 'hidden',
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.error,
    borderRadius: 9999,
  },
  progressOverflow: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    backgroundColor: colors.error,
    opacity: 0.3,
    borderRadius: 9999,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FF6E5A1A',
    borderLeftWidth: 5,
    borderLeftColor: colors.error,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  errorMessage: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 14 * 1.3,
    color: colors.textDark,
  },
  actions: {
    gap: 12,
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
