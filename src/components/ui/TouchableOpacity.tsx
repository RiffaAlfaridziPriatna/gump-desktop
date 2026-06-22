import {clickableStyle} from '@lib/clickable';
import {
  TouchableOpacity as RNTouchableOpacity,
  TouchableOpacityProps,
} from 'react-native';

export function TouchableOpacity({
  style,
  disabled,
  ...rest
}: TouchableOpacityProps) {
  return (
    <RNTouchableOpacity
      style={[(!disabled && clickableStyle) as TouchableOpacityProps['style'], style]}
      disabled={disabled}
      {...rest}
    />
  );
}
