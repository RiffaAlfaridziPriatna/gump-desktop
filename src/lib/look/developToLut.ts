import {
  parseLookFinishing,
  type LookFinishing,
} from '@domain/valueObjects/LookFinishing';
import { MAX_LUT_SIZE, MIN_LUT_SIZE } from './cubeParser';
import { applyColor, buildColorParams } from './developColor';
import type { DevelopSettings } from './developSettings';
import { buildToneAxes } from './developTone';
import type { NativeLookFinishing } from './types';

/**
 * Evaluates the per-pixel develop fields over an sRGB lattice and returns
 * canonical .cube text (R fastest). Default settings give an identity LUT.
 * Spatial fields are not evaluated here; see splitFinishing.
 */
export function buildLut(settings: DevelopSettings, size = 33): string {
  if (!Number.isInteger(size) || size < MIN_LUT_SIZE || size > MAX_LUT_SIZE) {
    throw new RangeError(
      `LUT size must be an integer in ${MIN_LUT_SIZE}..${MAX_LUT_SIZE}, got ${size}`,
    );
  }
  const [rAxis, gAxis, bAxis] = buildToneAxes(settings, size);
  const data = new Float64Array(size ** 3 * 3);
  let o = 0;
  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        data[o++] = rAxis[ri];
        data[o++] = gAxis[gi];
        data[o++] = bAxis[bi];
      }
    }
  }
  applyColor(data, buildColorParams(settings));

  const lines = new Array<string>(size ** 3 + 2);
  lines[0] = 'TITLE "GUMP develop"';
  lines[1] = `LUT_3D_SIZE ${size}`;
  for (let i = 0, n = 2; i < data.length; i += 3, n++) {
    lines[n] = `${data[i].toFixed(6)} ${data[i + 1].toFixed(6)} ${data[
      i + 2
    ].toFixed(6)}`;
  }
  return `${lines.join('\n')}\n`;
}

/** Spatial fields for native finishing; null when none has a visible effect. */
export function splitFinishing(
  settings: DevelopSettings,
): LookFinishing | null {
  const { texture, clarity, dehaze, vignette, grain } = settings;
  if (
    texture === 0 &&
    clarity === 0 &&
    dehaze === 0 &&
    vignette.amount === 0 &&
    grain.amount === 0
  ) {
    return null;
  }
  return parseLookFinishing({
    texture,
    clarity,
    dehaze,
    vignetteAmount: vignette.amount,
    vignetteMidpoint: vignette.midpoint,
    vignetteFeather: vignette.feather,
    vignetteRoundness: vignette.roundness,
    grainAmount: grain.amount,
    grainSize: grain.size,
    grainRoughness: grain.frequency,
  });
}

/**
 * Native finishing for a custom preset. Lightroom's post-crop vignette follows
 * the frame, hence the frame ellipse; vignetteRoundness is not read natively.
 */
export function toNativeFinishing(
  finishing: LookFinishing,
): NativeLookFinishing {
  return {
    ...finishing,
    warmNudge: 0,
    settleNudge: 0,
    vignetteFrameEllipse: true,
  };
}
