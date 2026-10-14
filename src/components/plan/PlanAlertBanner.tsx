import type {PhotoUsageState} from '@domain/plan';
import {colors} from '@lib/ui/colors';
import {fonts} from '@lib/ui/typography';
import {StyleSheet, Text, View} from 'react-native';

type PlanAlertBannerProps = {
  variant: PhotoUsageState | 'free';
};

const COPY: Record<PlanAlertBannerProps['variant'], string | null> = {
  normal: null,
  warning:
    "You've used most of your processing capacity. Add more if you expect another big album.",
  limit:
    "You've used all processing capacity on this plan. Top up or upgrade to keep Gump processing new photos.",
  free: 'Process up to 3,000 photos with Gump. Upgrade to unlock more processing capacity and higher export quality.',
};

export function PlanAlertBanner({variant}: PlanAlertBannerProps) {
  const message = COPY[variant];
  if (!message) {
    return null;
  }

  const isLimit = variant === 'limit';
  const isWarning = variant === 'warning';
  const isFree = variant === 'free';

  return (
    <View
      style={[
        styles.banner,
        isWarning && styles.bannerWarning,
        isLimit && styles.bannerLimit,
        isFree && styles.bannerFree,
      ]}>
      <View
        style={[
          styles.icon,
          isWarning && styles.iconWarning,
          isLimit && styles.iconLimit,
          isFree && styles.iconFree,
        ]}>
        <Text
          style={[
            styles.iconText,
            isWarning && styles.iconTextWarning,
            isLimit && styles.iconTextLimit,
            isFree && styles.iconTextFree,
          ]}>
          i
        </Text>
      </View>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  bannerWarning: {
    backgroundColor: '#FFF3E8',
    borderLeftWidth: 5,
    borderLeftColor: colors.accent,
  },
  bannerLimit: {
    backgroundColor: '#FFECE9',
    borderLeftWidth: 5,
    borderLeftColor: colors.error,
  },
  bannerFree: {
    backgroundColor: colors.cardGrayLight,
  },
  icon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  iconWarning: {
    backgroundColor: colors.accent,
  },
  iconLimit: {
    backgroundColor: colors.error,
  },
  iconFree: {
    backgroundColor: colors.textMuted,
  },
  iconText: {
    fontFamily: fonts.sansBold,
    fontSize: 11,
    color: colors.white,
    lineHeight: 14,
  },
  iconTextWarning: {
    color: colors.white,
  },
  iconTextLimit: {
    color: colors.white,
  },
  iconTextFree: {
    color: colors.white,
  },
  message: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textDark,
  },
});
