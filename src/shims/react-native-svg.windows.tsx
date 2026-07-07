import React from 'react';
import {View, type ViewProps} from 'react-native';

/**
 * RNSVG native WinRT registration aborts on RNW new arch (REGDB_E_CLASSNOTREG).
 * Use View stubs so SVG imports compile; icons won't render until RNSVG is fixed upstream.
 */
const SvgStub = React.forwardRef<View, ViewProps>(function SvgStub(props, ref) {
  return <View ref={ref} {...props} />;
});

export default SvgStub;

export const Svg = SvgStub;
export const Path = SvgStub;
export const G = SvgStub;
export const Circle = SvgStub;
export const Rect = SvgStub;
export const Defs = SvgStub;
export const LinearGradient = SvgStub;
export const RadialGradient = SvgStub;
export const Stop = SvgStub;
export const ClipPath = SvgStub;
export const Ellipse = SvgStub;
export const Line = SvgStub;
export const Polygon = SvgStub;
export const Polyline = SvgStub;
export const Text = SvgStub;
export const TSpan = SvgStub;
export const TextPath = SvgStub;
export const Use = SvgStub;
export const Symbol = SvgStub;
export const Mask = SvgStub;
export const Pattern = SvgStub;
export const Image = SvgStub;
export const ForeignObject = SvgStub;
export const Marker = SvgStub;
export const Shape = SvgStub;

export const RNSVGCircle = SvgStub;
export const RNSVGClipPath = SvgStub;
export const RNSVGDefs = SvgStub;
export const RNSVGEllipse = SvgStub;
export const RNSVGFeColorMatrix = SvgStub;
export const RNSVGFeComposite = SvgStub;
export const RNSVGFeGaussianBlur = SvgStub;
export const RNSVGFeMerge = SvgStub;
export const RNSVGFeOffset = SvgStub;
export const RNSVGFilter = SvgStub;
export const RNSVGForeignObject = SvgStub;
export const RNSVGGroup = SvgStub;
export const RNSVGImage = SvgStub;
export const RNSVGLine = SvgStub;
export const RNSVGLinearGradient = SvgStub;
export const RNSVGMarker = SvgStub;
export const RNSVGMask = SvgStub;
export const RNSVGPath = SvgStub;
export const RNSVGPattern = SvgStub;
export const RNSVGRadialGradient = SvgStub;
export const RNSVGRect = SvgStub;
export const RNSVGSvgAndroid = SvgStub;
export const RNSVGSvgIOS = SvgStub;
export const RNSVGSymbol = SvgStub;
export const RNSVGText = SvgStub;
export const RNSVGTextPath = SvgStub;
export const RNSVGTSpan = SvgStub;
export const RNSVGUse = SvgStub;

export function parse() {
  return null;
}

export function camelCase(value: string) {
  return value;
}

export async function fetchText() {
  return '';
}
