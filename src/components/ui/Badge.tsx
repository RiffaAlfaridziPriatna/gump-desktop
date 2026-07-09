import {colors} from '@lib/ui/colors';
import {fonts} from '@lib/ui/typography';
import {StyleSheet, Text} from 'react-native';
import IconCheck from '../../assets/images/icon_check_circle.svg';
import IconScissors from '../../assets/images/icon_scissors.svg';
import {FrostedView, type FrostedBackdrop} from './frosted';

type BadgeProps = {
  variant: 'uploaded' | 'culled';
  label?: string;
  backdrop?: FrostedBackdrop;
};

export function Badge({variant, label, backdrop}: BadgeProps) {
  const isUploaded = variant === 'uploaded';
  const text = label ?? (isUploaded ? 'Uploaded' : 'Culled');

  return (
    <FrostedView style={styles.container} fallbackColor={colors.badge} backdrop={backdrop}>
      {isUploaded ? (
        <IconCheck width={16} height={16} color={colors.textDark} />
      ) : (
        <IconScissors width={16} height={16} color={colors.textDark} />
      )}
      <Text style={styles.text}>{text}</Text>
    </FrostedView>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 100,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  text: {
    fontFamily: fonts.sans,
    fontSize: 12,
    lineHeight: 12 * 1.2,
    letterSpacing: 0,
    fontWeight: '600',
    color: colors.textDark,
  },
});
