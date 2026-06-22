import {StyleSheet, ViewStyle} from 'react-native';
import {TouchableOpacity} from './TouchableOpacity';
import CheckboxChecked from '../../assets/images/checkbox_checked.svg';
import CheckboxUnchecked from '../../assets/images/checkbox_unchecked.svg';
import { colors } from '@lib/colors';
import { ReactNode } from 'react';

type CheckboxProps = {
  checked: boolean;
  onToggle: () => void;
  size?: number;
  color?: string;
  style?: ViewStyle;
  children?: ReactNode;
};

export function Checkbox({
  checked,
  onToggle,
  size = 20,
  color = colors.text,
  style,
  children,
}: CheckboxProps) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.7}
      style={[styles.container, style]}>
      {checked ? (
        <CheckboxChecked width={size} height={size} color={color} />
      ) : (
        <CheckboxUnchecked width={size} height={size} color={color} />
      )}
      {children}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
