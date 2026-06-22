import {clickableStyle} from '@lib/clickable';
import {
  Pressable as RNPressable,
  PressableProps,
  PressableStateCallbackType,
  StyleProp,
  ViewStyle,
} from 'react-native';

function resolveStyle(
  style: PressableProps['style'],
  state: PressableStateCallbackType,
): StyleProp<ViewStyle> {
  if (typeof style === 'function') {
    return style(state);
  }
  return style;
}

export function Pressable({style, disabled, ...rest}: PressableProps) {
  return (
    <RNPressable
      style={state => [
        !disabled && clickableStyle,
        resolveStyle(style, state),
      ]}
      disabled={disabled}
      {...rest}
    />
  );
}
