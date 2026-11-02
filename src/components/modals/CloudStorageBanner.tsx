import {colors} from '@lib/ui/colors';
import {fonts} from '@lib/ui/typography';
import {StyleSheet, Text, View} from 'react-native';
import IconInfo from '../../assets/images/icon_info.svg';
import {PopupIcon} from './UploadPopupParts';

export function CloudStorageBanner({
  tone,
  message,
}: {
  tone: 'warning' | 'danger';
  message: string;
}) {
  const color = tone === 'danger' ? colors.red : colors.accent;
  return (
    <View
      accessible
      accessibilityLabel={`Warning: ${message}`}
      style={[
        styles.banner,
        tone === 'danger' ? styles.danger : styles.warning,
      ]}>
      <PopupIcon>
        <IconInfo width={16} height={16} color={color} />
      </PopupIcon>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    borderLeftWidth: 5,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  warning: {
    backgroundColor: 'rgba(255,150,50,0.1)',
    borderLeftColor: colors.accent,
  },
  danger: {
    backgroundColor: 'rgba(255,110,90,0.1)',
    borderLeftColor: colors.red,
  },
  text: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 14 * 1.3,
    color: colors.textDark,
  },
});
