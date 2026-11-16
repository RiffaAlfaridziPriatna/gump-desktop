import type { ParseFailure } from '@lib/look/cubeParser';
import { colors } from '@lib/ui/colors';
import { fonts } from '@lib/ui/typography';
import { StyleSheet, Text, View } from 'react-native';
import IconError from '../../assets/images/icon_error_info.svg';

export type LookImportError = ParseFailure['reason'];

type LookImportErrorBannerProps = {
  error: LookImportError;
};

const MESSAGES: Record<LookImportError, string> = {
  unsupported: "Unsupported file format. Your album look hasn't changed.",
  unreadable: "This file can't be read. Your album look hasn't changed.",
};

export function LookImportErrorBanner({ error }: LookImportErrorBannerProps) {
  return (
    <View
      style={styles.banner}
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      accessibilityLabel={MESSAGES[error]}
    >
      <IconError width={16} height={16} />
      <Text style={styles.text}>{MESSAGES[error]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderLeftWidth: 5,
    borderLeftColor: colors.error,
    // Figma: error at 10% opacity.
    backgroundColor: 'rgba(255,110,90,0.1)',
  },
  text: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 14 * 1.3,
    color: colors.textDark,
  },
});
