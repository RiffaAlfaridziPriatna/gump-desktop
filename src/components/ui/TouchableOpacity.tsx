import {clickableStyle} from '@lib/ui/clickable';
import {
  Platform,
  TouchableOpacity as RNTouchableOpacity,
  TouchableOpacityProps,
} from 'react-native';

const macosClickThrough =
  Platform.OS === 'macos' ? ({acceptsFirstMouse: true} as TouchableOpacityProps) : null;

export function TouchableOpacity({
  style,
  disabled,
  ...rest
}: TouchableOpacityProps) {
  return (
    <RNTouchableOpacity
      style={[(!disabled && clickableStyle) as TouchableOpacityProps['style'], style]}
      disabled={disabled}
      {...macosClickThrough}
      {...rest}
    />
  );
}
