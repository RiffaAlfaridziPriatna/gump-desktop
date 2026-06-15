import type {ViewProps} from 'react-native';
import {View} from 'react-native';

import type {
  VisualEffectBlendingMode,
  VisualEffectMaterial,
} from './types';

export type {VisualEffectBlendingMode, VisualEffectMaterial};

export type VisualEffectViewProps = ViewProps & {
  material?: VisualEffectMaterial;
  blendingMode?: VisualEffectBlendingMode;
};

export function VisualEffectView({style, children, ...props}: VisualEffectViewProps) {
  return (
    <View style={style} {...props}>
      {children}
    </View>
  );
}
