import type {ColorValue, ViewProps} from 'react-native';
import {requireNativeComponent} from 'react-native';

import type {
  VisualEffectBlendingMode,
  VisualEffectMaterial,
} from './types';

export type {VisualEffectBlendingMode, VisualEffectMaterial};

export type NativeVisualEffectViewProps = ViewProps & {
  material?: VisualEffectMaterial;
  blendingMode?: VisualEffectBlendingMode;
  tintColor?: ColorValue;
  cornerRadius?: number;
};

export const NativeVisualEffectView =
  requireNativeComponent<NativeVisualEffectViewProps>('GumpVisualEffectView');
