import { buildCurve, clamp } from './developCurve';
import type { DevelopSettings } from './developSettings';

// s9a joint-fit constants (without baseChroma 1.09, which would break identity); GUMP's own, not Adobe's.
const K = {
  temp: 0.05487670898437502,
  tint: 0.003,
  contrast: 0.5061264038085938,
  highlights: 0.07029533386230469,
  shadows: 0.13759732246398926,
  whites: 0.6027374267578125,
  blacks: 0.15, // K0: the fitted -0.179 inverts the Blacks slider direction
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toSrgb = (c: number) =>
  clamp01(
    c <= 0.0031308 ? c * 12.92 : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055,
  );

/**
 * Everything before the HSL stage acts per channel on one lattice axis value,
 * so it is evaluated once per axis step (size values per channel), not per pixel.
 * Returns [rAxis, gAxis, bAxis], each Float64Array(size).
 */
export function buildToneAxes(
  s: DevelopSettings,
  size: number,
): [Float64Array, Float64Array, Float64Array] {
  const t = clamp(s.temperature, -100, 100) / 100;
  const ti = clamp(s.tint, -100, 100) / 100;
  const gain = 2 ** clamp(s.exposure, -5, 5);
  const c = clamp(s.contrast, -100, 100) / 100;
  const hi = clamp(s.highlights, -100, 100) / 100;
  const sh = clamp(s.shadows, -100, 100) / 100;
  const wh = clamp(s.whites, -100, 100) / 100;
  const bl = clamp(s.blacks, -100, 100) / 100;
  const master = buildCurve(s.toneCurve.master);
  const curves = [
    buildCurve(s.toneCurve.red),
    buildCurve(s.toneCurve.green),
    buildCurve(s.toneCurve.blue),
  ];
  // GUMP approximation: white balance as linear-light channel gains (R/B opposed, G for tint; exponential so gains stay positive).
  const kt = (K.temp * 25) / Math.LN2;
  const kg = (K.tint * 25) / Math.LN2;
  const wb = [2 ** (kt * t), 2 ** (-kg * ti), 2 ** (-kt * t)];

  // GUMP approximation: contrast S-curve and highlights/shadows/whites/blacks as global zone curves.
  const tone = (x: number) => {
    let y = x;
    y += K.contrast * c * 4 * y * (1 - y) * (2 * y - 1) * 0.5;
    y += K.highlights * hi * 6.75 * y * y * (1 - y);
    y += K.shadows * sh * 6.75 * y * (1 - y) * (1 - y);
    y += K.whites * wh * y ** 3;
    y += K.blacks * bl * (1 - y) ** 3;
    return clamp01(master(clamp01(y)));
  };

  const axes = [0, 1, 2].map(ch => {
    const axis = new Float64Array(size);
    for (let i = 0; i < size; i++) {
      const v = toSrgb(toLinear(i / (size - 1)) * wb[ch] * gain);
      axis[i] = clamp01(curves[ch](tone(v)));
    }
    return axis;
  });
  return [axes[0], axes[1], axes[2]];
}
