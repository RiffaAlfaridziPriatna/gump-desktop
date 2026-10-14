import {TouchableOpacity} from '@components/ui';
import {colors} from '@lib/ui/colors';
import {sansBoldStyle} from '@lib/ui/typography';
import {StyleSheet, Text} from 'react-native';
import IconChevronRight from '../../assets/images/icon_chevron_right.svg';

type HeaderPlanButtonProps = {
  planName: string;
  onPress: () => void;
};

export function HeaderPlanButton({planName, onPress}: HeaderPlanButtonProps) {
  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Open ${planName} plan`}>
      <Text style={styles.label}>{planName}</Text>
      <IconChevronRight width={16} height={16} color={colors.textMuted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 10,
    paddingRight: 6,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.fabBackground,
    backgroundColor: colors.background,
  },
  label: {
    ...sansBoldStyle,
    fontSize: 14,
    color: colors.white,
  },
});
