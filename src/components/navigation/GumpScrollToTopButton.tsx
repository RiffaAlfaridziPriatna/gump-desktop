import {TouchableOpacity} from '@components/ui';
import {colors} from '@lib/ui/colors';
import type {StyleProp, ViewStyle} from 'react-native';
import {StyleSheet} from 'react-native';
import IconChevronUp from '../../assets/images/icon_chevron_up.svg';

type GumpScrollToTopButtonProps = {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

export function GumpScrollToTopButton({
  onPress,
  style,
}: GumpScrollToTopButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.fab, style]}
      onPress={onPress}
      onPressIn={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="Scroll to top"
    >
      <IconChevronUp width={32} height={32} color={colors.white} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    width: 48,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.fabBackground,
  },
});
