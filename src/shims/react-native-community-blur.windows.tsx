import React from 'react';
import {View, type ViewProps} from 'react-native';

type BlurProps = ViewProps & {
  blurType?: string;
  blurAmount?: number;
  reducedTransparencyFallbackColor?: string;
};

const BlurStub = React.forwardRef<View, BlurProps>(function BlurStub(
  {children, style, ...rest},
  ref,
) {
  return (
    <View ref={ref} style={style} {...rest}>
      {children}
    </View>
  );
});

export const BlurView = BlurStub;
export const VibrancyView = BlurStub;
