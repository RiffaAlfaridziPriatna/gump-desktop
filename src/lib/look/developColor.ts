import { clamp } from './developCurve';
import type { DevelopSettings } from './developSettings';

// s9a joint-fit constants (without baseChroma 1.09, which would break identity); GUMP's own, not Adobe's.
const K = {
  hueDeg: 45.286030769348145,
  hslSat: 1.1737067699432373,
  hslLum: 0.27841387316584587,
  vib: 0.5125050544738771,
  split: 0.27192211151123047,
  grade: 0.43435680866241455,
};

const HUE_CENTERS = [0, 30, 60, 120, 180, 240, 270, 300];
const BAND_ORDER = [
  'red',
  'orange',
  'yellow',
  'green',
  'aqua',
  'blue',
  'purple',
  'magenta',
] as const;

export type ColorParams = {
  hue: Float64Array;
  sat: Float64Array;
  lum: Float64Array;
  saturation: number;
  vibrance: number;
  hslActive: boolean;
  grayscale: boolean;
  shadowTint: Float64Array;
  highlightTint: Float64Array;
  midTint: Float64Array;
  shadowAmount: number;
  highlightAmount: number;
  midAmount: number;
  balance: number;
  tintActive: boolean;
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

function sector(h: number): [number, number] {
  const hp = (((h % 360) + 360) % 360) / 60;
  return [Math.floor(hp), 1 - Math.abs((hp % 2) - 1)];
}

function tintVector(hue: number): Float64Array {
  const [k, x] = sector(clamp(hue, 0, 360));
  const out = new Float64Array(3);
  out[0] = (k === 0 || k === 5 ? 1 : k === 1 || k === 4 ? x : 0) - 0.5;
  out[1] = (k === 1 || k === 2 ? 1 : k === 0 || k === 3 ? x : 0) - 0.5;
  out[2] = (k === 3 || k === 4 ? 1 : k === 2 || k === 5 ? x : 0) - 0.5;
  return out;
}

export function buildColorParams(s: DevelopSettings): ColorParams {
  const hue = new Float64Array(8);
  const sat = new Float64Array(8);
  const lum = new Float64Array(8);
  let hslActive = false;
  BAND_ORDER.forEach((name, i) => {
    hue[i] = clamp(s.hsl[name].hue, -100, 100) / 100;
    sat[i] = clamp(s.hsl[name].saturation, -100, 100) / 100;
    lum[i] = clamp(s.hsl[name].luminance, -100, 100) / 100;
    hslActive ||= hue[i] !== 0 || sat[i] !== 0 || lum[i] !== 0;
  });
  const saturation = clamp(s.saturation, -100, 100) / 100;
  const vibrance = clamp(s.vibrance, -100, 100) / 100;
  const st = s.splitToning;
  const shadowAmount = clamp(st.shadowSaturation, 0, 100) / 100;
  const highlightAmount = clamp(st.highlightSaturation, 0, 100) / 100;
  const midAmount = clamp(s.midtoneGrade.saturation, 0, 100) / 100;
  return {
    hue,
    sat,
    lum,
    saturation,
    vibrance,
    hslActive: hslActive || saturation !== 0 || vibrance !== 0,
    grayscale: s.grayscale,
    shadowTint: tintVector(st.shadowHue),
    highlightTint: tintVector(st.highlightHue),
    midTint: tintVector(s.midtoneGrade.hue),
    shadowAmount,
    highlightAmount,
    midAmount,
    balance: clamp(st.balance, -100, 100) / 100,
    tintActive: shadowAmount > 0 || highlightAmount > 0 || midAmount > 0,
  };
}

const rgb = new Float64Array(3);

function hslToRgb(h: number, s: number, l: number): void {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const k = Math.floor(hp);
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c / 2;
  rgb[0] = (k === 0 || k === 5 ? c : k === 1 || k === 4 ? x : 0) + m;
  rgb[1] = (k === 1 || k === 2 ? c : k === 0 || k === 3 ? x : 0) + m;
  rgb[2] = (k === 3 || k === 4 ? c : k === 2 || k === 5 ? x : 0) + m;
}

function applyHsl(r: number, g: number, b: number, p: ColorParams): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d <= 0) {
    return false;
  }
  const l0 = (max + min) / 2;
  let h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
      ? (b - r) / d + 2
      : (r - g) / d + 4;
  h *= 60;
  if (h < 0) {
    h += 360;
  }
  let s = d / (1 - Math.abs(2 * l0 - 1));
  // GUMP approximation: HSL bands blend linearly between neighbouring hue centers.
  let i = 0;
  let t = 0;
  for (let k = 0; k < 8; k++) {
    const a = HUE_CENTERS[k];
    const e = HUE_CENTERS[(k + 1) % 8] + (k === 7 ? 360 : 0);
    const hh = h < a ? h + 360 : h;
    if (hh >= a && hh < e) {
      i = k;
      t = (hh - a) / (e - a);
      break;
    }
  }
  const j = (i + 1) % 8;
  const dh = p.hue[i] * (1 - t) + p.hue[j] * t;
  const ds = p.sat[i] * (1 - t) + p.sat[j] * t;
  const dl = p.lum[i] * (1 - t) + p.lum[j] * t;
  s *= 1 + K.hslSat * ds;
  const l = l0 + K.hslLum * dl * s * (1 - Math.abs(2 * l0 - 1));
  // GUMP approximation: saturation scales chroma; vibrance favours low-saturation colors.
  s *= 1 + p.saturation;
  s *= 1 + K.vib * p.vibrance * (1 - s);
  hslToRgb(h + dh * K.hueDeg, clamp01(s), clamp01(l));
  return true;
}

/**
 * In-place per-pixel color stage over interleaved RGB. Gray pixels skip the
 * HSL math, and the whole block is skipped when no HSL, saturation or
 * vibrance field is set.
 */
export function applyColor(data: Float64Array, p: ColorParams): void {
  if (!p.hslActive && !p.grayscale && !p.tintActive) {
    return;
  }
  for (let o = 0; o < data.length; o += 3) {
    let r = data[o];
    let g = data[o + 1];
    let b = data[o + 2];
    if (p.hslActive && applyHsl(r, g, b, p)) {
      r = rgb[0];
      g = rgb[1];
      b = rgb[2];
    }
    if (p.grayscale) {
      r = g = b = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    if (p.tintActive) {
      // GUMP approximation: split toning and midtone grade add tinted offsets weighted by luminance zone.
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const ws =
        clamp01(1 - lum - p.balance * 0.5) ** 2 * p.shadowAmount * K.split;
      const wh =
        clamp01(lum - p.balance * 0.5) ** 2 * p.highlightAmount * K.split;
      const wm = 4 * lum * (1 - lum) * p.midAmount * K.grade;
      r += ws * p.shadowTint[0] + wh * p.highlightTint[0] + wm * p.midTint[0];
      g += ws * p.shadowTint[1] + wh * p.highlightTint[1] + wm * p.midTint[1];
      b += ws * p.shadowTint[2] + wh * p.highlightTint[2] + wm * p.midTint[2];
    }
    data[o] = clamp01(r);
    data[o + 1] = clamp01(g);
    data[o + 2] = clamp01(b);
  }
}
