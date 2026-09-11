import type {NativeSyntheticEvent, StyleProp, ViewProps, ViewStyle} from 'react-native';
import {requireNativeComponent} from 'react-native';

type NativeScrollToTopEvent = NativeSyntheticEvent<{native: boolean}>;

type NativeProps = ViewProps & {
  onNativePress?: (event: NativeScrollToTopEvent) => void;
};

const NativeScrollToTopButton =
  requireNativeComponent<NativeProps>('GumpScrollToTopButton');

type GumpScrollToTopButtonProps = {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

export function GumpScrollToTopButton({
  onPress,
  style,
}: GumpScrollToTopButtonProps) {
  return (
    <NativeScrollToTopButton
      style={style}
      onNativePress={() => onPress()}
      accessibilityRole="button"
      accessibilityLabel="Scroll to top"
    />
  );
}
