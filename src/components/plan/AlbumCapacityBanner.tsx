import { formatPhotoCount } from '@application/plan/formatPlanNumbers';
import { TouchableOpacity } from '@components/ui';
import { colors } from '@lib/ui/colors';
import { fonts, sansBoldStyle } from '@lib/ui/typography';
import { StyleSheet, Text, View } from 'react-native';
import IconClose from '../../assets/images/icon_close.svg';
import IconInfo from '../../assets/images/icon_info.svg';

type AlbumCapacityBannerProps = {
  variant: 'processing' | 'warning' | 'success';
  photoCount: number;
  photosUsed: number;
  photosLimit: number;
  capacityAdded?: number;
  onAddCapacity?: () => void;
  onDismiss?: () => void;
};

function ProcessingContent({
  photoCount,
  photosUsed,
  photosLimit,
}: {
  photoCount: number;
  photosUsed: number;
  photosLimit: number;
}) {
  return (
    <Text style={styles.message}>
      Gump will process{' '}
      <Text style={styles.messageHighlight}>
        {formatPhotoCount(photoCount)} photos
      </Text>{' '}
      from your plan · Total processed:{' '}
      <Text style={styles.messageHighlight}>
        {formatPhotoCount(photosUsed)} / {formatPhotoCount(photosLimit)}
      </Text>
    </Text>
  );
}

function WarningContent({
  photoCount,
  photosUsed,
  photosLimit,
  onAddCapacity,
}: {
  photoCount: number;
  photosUsed: number;
  photosLimit: number;
  onAddCapacity?: () => void;
}) {
  const remaining = Math.max(0, photosLimit - photosUsed);
  const exceeding = Math.max(0, photoCount - remaining);

  return (
    <>
      <IconInfo
        width={16}
        height={16}
        color={colors.accent}
        style={styles.warningIcon}
      />
      <View style={styles.warningContent}>
        <Text style={styles.warningMessage}>
          Gump has processed{' '}
          <Text style={styles.warningMessageBold}>
            {formatPhotoCount(photosUsed)} / {formatPhotoCount(photosLimit)}{' '}
            photos
          </Text>{' '}
          on this plan.
        </Text>
        <Text style={styles.warningMessageSmaller}>
          This album will use{' '}
          <Text style={styles.warningMessageBold}>
            {formatPhotoCount(exceeding)} more
          </Text>
          . If you expect more albums soon, consider adding capacity.
        </Text>
      </View>
      {onAddCapacity ? (
        <TouchableOpacity
          style={styles.addCapacityButton}
          onPress={onAddCapacity}
          activeOpacity={0.8}
        >
          <Text style={styles.addCapacityText}>Add Capacity</Text>
        </TouchableOpacity>
      ) : null}
    </>
  );
}

function SuccessContent({
  capacityAdded,
  photosLimit,
}: {
  capacityAdded: number;
  photosLimit: number;
}) {
  return (
    <>
      <IconInfo
        width={16}
        height={16}
        color={colors.success}
        style={styles.successIcon}
      />
      <Text style={styles.successMessage}>
        <Text style={styles.successMessageBold}>
          +{formatPhotoCount(capacityAdded)}
        </Text>{' '}
        photos added · New capacity{' '}
        <Text style={styles.successMessageBold}>
          {formatPhotoCount(photosLimit)}
        </Text>
      </Text>
    </>
  );
}

export function AlbumCapacityBanner({
  variant,
  photoCount,
  photosUsed,
  photosLimit,
  capacityAdded = 0,
  onAddCapacity,
  onDismiss,
}: AlbumCapacityBannerProps) {
  const isProcessing = variant === 'processing';
  const isWarning = variant === 'warning';
  const isSuccess = variant === 'success';
  const showDismiss = (isWarning || isSuccess) && onDismiss;

  return (
    <View
      style={[
        styles.banner,
        isProcessing && styles.bannerProcessing,
        isWarning && styles.bannerWarning,
        isSuccess && styles.bannerSuccess,
      ]}
    >
      {isProcessing && (
        <ProcessingContent
          photoCount={photoCount}
          photosUsed={photosUsed}
          photosLimit={photosLimit}
        />
      )}
      {isWarning && (
        <WarningContent
          photoCount={photoCount}
          photosUsed={photosUsed}
          photosLimit={photosLimit}
          onAddCapacity={onAddCapacity}
        />
      )}
      {isSuccess && (
        <SuccessContent
          capacityAdded={capacityAdded}
          photosLimit={photosLimit}
        />
      )}
      {showDismiss ? (
        <TouchableOpacity
          style={styles.dismissButton}
          onPress={onDismiss}
          activeOpacity={0.7}
        >
          <IconClose width={20} height={20} color={colors.text} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  bannerProcessing: {
    backgroundColor: '#1D1D1D',
  },
  bannerWarning: {
    backgroundColor: '#FF96321A',
    borderLeftWidth: 5,
    borderLeftColor: colors.accent,
  },
  bannerSuccess: {
    backgroundColor: '#83D8411A',
    borderLeftWidth: 5,
    borderLeftColor: colors.success,
  },
  message: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 32,
    color: colors.text,
  },
  messageHighlight: {
    fontWeight: 600,
  },
  warningIcon: {
    marginRight: 16,
  },
  warningContent: {
    flex: 1,
    gap: 8,
    paddingRight: 16,
  },
  warningMessage: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 20,
    color: colors.text,
  },
  warningMessageSmaller: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 18,
    color: colors.text,
  },
  warningMessageBold: {
    ...sansBoldStyle,
  },
  addCapacityButton: {
    backgroundColor: colors.accent,
    borderRadius: 9999,
    paddingVertical: 8,
    paddingHorizontal: 24,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCapacityText: {
    ...sansBoldStyle,
    fontSize: 16,
    color: colors.white,
  },
  successIcon: {
    marginRight: 16,
  },
  successMessage: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 20,
    color: colors.text,
  },
  successMessageBold: {
    fontWeight: 600,
  },
  dismissButton: {
    padding: 4,
    marginLeft: 16,
  },
});
