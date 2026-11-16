import { applyColor, buildColorParams } from '@lib/look/developColor';
import {
  defaultSettings,
  type DevelopSettings,
} from '@lib/look/developSettings';
import { buildLut } from '@lib/look/developToLut';

type Rgb = [number, number, number];
const N = 9;

function lut(mutate: (s: DevelopSettings) => void): Rgb[] {
  const s = defaultSettings();
  mutate(s);
  const rows = buildLut(s, N)
    .split('\n')
    .filter(
      line => /^[-\w.]+ [-\w.]+ [-\w.]+$/.test(line) && !/^[A-Z_]/.test(line),
    )
    .map(line => line.split(' ').map(Number) as Rgb);
  expect(rows).toHaveLength(N ** 3);
  rows.forEach(row => row.forEach(v => expect(v >= 0 && v <= 1).toBe(true)));
  return rows;
}

const at = (rows: Rgb[], r: number, g: number, b: number): Rgb =>
  rows[r + g * N + b * N * N];
const chroma = ([r, g, b]: Rgb) => Math.max(r, g, b) - Math.min(r, g, b);

describe('edge cases', () => {
  it.each([-100, 100])(
    'white balance at %d keeps every channel positive',
    v => {
      for (const field of ['temperature', 'tint'] as const) {
        const rows = lut(s => (s[field] = v));
        const [r, g, b] = at(rows, 4, 4, 4);
        expect(Math.min(r, g, b)).toBeGreaterThan(0.05);
        if (field === 'temperature') {
          expect(v > 0 ? r > b : r < b).toBe(true);
        } else {
          expect(v > 0 ? g < r : g > r).toBe(true);
        }
      }
    },
  );

  it('vibrance does not reduce chroma of saturated colors', () => {
    const base = (s: DevelopSettings) => {
      s.saturation = 100;
      s.hsl.red.saturation = 100;
    };
    const before = at(lut(base), 8, 2, 2);
    const after = at(
      lut(s => {
        base(s);
        s.vibrance = 100;
      }),
      8,
      2,
      2,
    );
    expect(chroma(after)).toBeGreaterThanOrEqual(chroma(before) - 1e-6);
  });

  it('near-white input with HSL luminance stays finite', () => {
    const s = defaultSettings();
    s.hsl.red.luminance = 50;
    s.saturation = 50;
    const eps = 2 ** -53;
    const data = new Float64Array([1, 1 - eps, 1 - eps, 1, 1, 1 - 1e-15]);
    const params = buildColorParams(s);
    applyColor(data, params);
    data.forEach(v => expect(Number.isFinite(v)).toBe(true));
  });

  it.each([-100, 100])(
    'split balance %d moves each zone against balance 0',
    bal => {
      const tone = (balance: number, zone: 'shadow' | 'highlight') =>
        at(
          lut(s => {
            s.splitToning[`${zone}Hue`] = 240;
            s.splitToning[`${zone}Saturation`] = 100;
            s.splitToning.balance = balance;
          }),
          ...(zone === 'shadow' ? ([4, 4, 4] as const) : ([6, 6, 6] as const)),
        )[2];
      // Positive balance shrinks the shadow zone and grows the highlight zone.
      expect(tone(bal, 'shadow') > tone(0, 'shadow')).toBe(bal < 0);
      expect(tone(bal, 'highlight') > tone(0, 'highlight')).toBe(bal > 0);
    },
  );
});
