import type {ReactNode} from 'react';
import type {ViewProps, ViewStyle} from 'react-native';

export type FrostedBackdrop = {
  uri?: string;
  coverWidth: number;
  coverHeight: number;
  coverX: number;
  coverY: number;
};

export type VisualEffectMaterial =
  | 'hudWindow'
  | 'menu'
  | 'popover'
  | 'sidebar'
  | 'titlebar'
  | 'headerView'
  | 'sheet'
  | 'windowBackground'
  | 'contentBackground'
  | 'underWindowBackground'
  | 'underPageBackground';

export type VisualEffectBlendingMode = 'withinWindow' | 'behindWindow';

export type FrostedViewProps = ViewProps & {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
  blurType?: 'light' | 'dark' | 'xlight';
  blurAmount?: number;
  fallbackColor?: string;
  material?: 'hudWindow' | 'popover' | 'menu' | 'contentBackground' | 'underPageBackground';
  backdrop?: FrostedBackdrop;
};
