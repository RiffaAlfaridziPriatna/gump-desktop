import {TouchableOpacity} from '@components/ui';
import {colors} from '@lib/ui/colors';
import {sansBoldStyle} from '@lib/ui/typography';
import {StyleSheet, Text, View} from 'react-native';
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
      <IconChevronRight width={16} height={16} color={colors.white} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.dividerLight,
    backgroundColor: colors.cardBackgroundSecondary,
  },
  label: {
    ...sansBoldStyle,
    fontSize: 14,
    color: colors.white,
  },
});
