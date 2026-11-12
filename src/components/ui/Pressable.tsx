import {clickableStyle} from '@lib/ui/clickable';
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

export function Pressable({
  style,
  disabled,
  enableFocusRing = false,
  ...rest
}: PressableProps) {
  return (
    <RNPressable
      style={state => [
        !disabled && clickableStyle,
        resolveStyle(style, state),
      ]}
      disabled={disabled}
      {...rest}
      // System focus ring clashes with branded chrome (phase 3 modals/sidebar).
      enableFocusRing={enableFocusRing}
    />
  );
}
