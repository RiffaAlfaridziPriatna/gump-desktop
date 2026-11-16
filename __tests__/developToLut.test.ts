import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCube } from '@lib/look/cubeParser';
import { buildLut } from '@lib/look/developToLut';
import {
  defaultSettings,
  type DevelopSettings,
} from '@lib/look/developSettings';
import { parseXmpPreset } from '@lib/look/xmpParser';
type Rgb = [number, number, number];
function parseRows(text: string, size: number): Rgb[] {
  expect(parseCube(text).ok).toBe(true);
  const rows = text
    .split('\n')
    .filter(
      line => /^[-\w.]+ [-\w.]+ [-\w.]+$/.test(line) && !/^[A-Z_]/.test(line),
    )
    .map(line => line.split(' ').map(Number) as Rgb);
  expect(rows).toHaveLength(size ** 3);
  rows.forEach(row => row.forEach(v => expect(v >= 0 && v <= 1).toBe(true)));
  return rows;
}

const N = 9;
function lut(mutate: (s: DevelopSettings) => void, size = N): Rgb[] {
  const s = defaultSettings();
  mutate(s);
  return parseRows(buildLut(s, size), size);
}
const at = (rows: Rgb[], r: number, g: number, b: number): Rgb =>
  rows[r + g * N + b * N * N];

const chroma = ([r, g, b]: Rgb) => Math.max(r, g, b) - Math.min(r, g, b);
const luma = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

describe('buildLut', () => {
  it('default settings give an identity LUT', () => {
    const rows = parseRows(buildLut(defaultSettings(), 33), 33);
    expect(rows).toHaveLength(33 ** 3);
    let max = 0;
    for (let b = 0; b < 33; b++) {
      for (let g = 0; g < 33; g++) {
        for (let r = 0; r < 33; r++) {
          const out = rows[r + g * 33 + b * 33 * 33];
          const err = Math.max(
            Math.abs(out[0] - r / 32),
            Math.abs(out[1] - g / 32),
            Math.abs(out[2] - b / 32),
          );
          max = Math.max(max, err);
        }
      }
    }
    expect(max).toBeLessThanOrEqual(1 / 1023);
  });

  it('output parses with parseCube', () => {
    const s = defaultSettings();
    s.contrast = 30;
    s.saturation = 20;
    const result = parseCube(buildLut(s, 17));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.size).toBe(17);
    }
  });

  it('rejects an out-of-range size', () => {
    expect(() => buildLut(defaultSettings(), 1)).toThrow(RangeError);
    expect(() => buildLut(defaultSettings(), 66)).toThrow(RangeError);
    expect(() => buildLut(defaultSettings(), 33.5)).toThrow(RangeError);
  });

  it('clamps inputs to Lightroom ranges', () => {
    expect(lut(s => (s.temperature = 1000))).toEqual(
      lut(s => (s.temperature = 100)),
    );
    expect(lut(s => (s.exposure = 50))).toEqual(lut(s => (s.exposure = 5)));
    expect(lut(s => (s.contrast = Number.NaN))).toEqual(lut(() => undefined));
  });

  it('builds 33 points in under 300 ms', () => {
    const s = defaultSettings();
    s.contrast = 20;
    s.hsl.red.saturation = 30;
    s.vibrance = 20;
    s.splitToning.shadowSaturation = 20;
    s.toneCurve.master = [
      [0, 10],
      [128, 140],
      [255, 250],
    ];
    buildLut(s, 33);
    const times = [0, 1, 2, 3, 4].map(() => {
      const start = performance.now();
      buildLut(s, 33);
      return performance.now() - start;
    });
    expect(Math.min(...times)).toBeLessThan(300);
  });

  it('builds the fixture presets', () => {
    const dir = join(__dirname, 'fixtures', 'presets');
    for (const name of ['clear-natural', 'warm-romantic', 'film-mood']) {
      const parsed = parseXmpPreset(
        readFileSync(join(dir, `${name}.xmp`), 'utf8'),
      );
      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parseCube(buildLut(parsed.settings, 33)).ok).toBe(true);
      }
    }
  });
});

describe('shipped per-pixel fields', () => {
  const gray = (i: number): [number, number, number] => [i, i, i];
  const color: [number, number, number] = [6, 5, 4];

  const cases: [
    string,
    (s: DevelopSettings) => void,
    number[],
    (o: Rgb, i: Rgb) => boolean,
  ][] = [
    [
      'temperature warms (R up, B down)',
      s => (s.temperature = 60),
      gray(4),
      (o, i) => o[0] > i[0] && o[2] < i[2],
    ],
    ['tint (G down)', s => (s.tint = 60), gray(4), (o, i) => o[1] < i[1]],
    [
      'exposure brightens',
      s => (s.exposure = 1),
      gray(3),
      (o, i) => luma(o) > luma(i),
    ],
    [
      'contrast darkens shadows',
      s => (s.contrast = 60),
      gray(2),
      (o, i) => o[1] < i[1],
    ],
    [
      'contrast brightens highlights',
      s => (s.contrast = 60),
      gray(6),
      (o, i) => o[1] > i[1],
    ],
    [
      'highlights negative darkens',
      s => (s.highlights = -60),
      gray(6),
      (o, i) => o[1] < i[1],
    ],
    [
      'shadows positive lifts',
      s => (s.shadows = 60),
      gray(2),
      (o, i) => o[1] > i[1],
    ],
    [
      'whites positive lifts',
      s => (s.whites = 60),
      gray(7),
      (o, i) => o[1] > i[1],
    ],
    [
      'blacks positive lifts',
      s => (s.blacks = 60),
      gray(1),
      (o, i) => o[1] > i[1],
    ],
    [
      'vibrance raises chroma',
      s => (s.vibrance = 60),
      color,
      (o, i) => chroma(o) > chroma(i),
    ],
    [
      'saturation raises chroma',
      s => (s.saturation = 60),
      color,
      (o, i) => chroma(o) > chroma(i),
    ],
    [
      'hsl red hue shifts toward orange (G up)',
      s => (s.hsl.red.hue = 100),
      [8, 2, 2],
      (o, i) => o[1] > i[1],
    ],
    [
      'hsl red saturation raises chroma',
      s => (s.hsl.red.saturation = 60),
      [7, 3, 3],
      (o, i) => chroma(o) > chroma(i),
    ],
    [
      'hsl red luminance lifts',
      s => (s.hsl.red.luminance = 60),
      [8, 3, 3],
      (o, i) => luma(o) > luma(i),
    ],
    [
      'hsl blue saturation lowers chroma',
      s => (s.hsl.blue.saturation = -60),
      [2, 3, 8],
      (o, i) => chroma(o) < chroma(i),
    ],
    [
      'split shadow hue+sat tints shadows blue',
      s => {
        s.splitToning.shadowHue = 240;
        s.splitToning.shadowSaturation = 60;
      },
      gray(1),
      (o, i) => o[2] > i[2] && o[0] <= i[0],
    ],
    [
      'split highlight hue+sat tints highlights red',
      s => {
        s.splitToning.highlightHue = 0;
        s.splitToning.highlightSaturation = 60;
      },
      gray(7),
      (o, i) => o[0] > i[0],
    ],
    [
      'midtone grade tints midtones red',
      s => {
        s.midtoneGrade.hue = 0;
        s.midtoneGrade.saturation = 60;
      },
      gray(4),
      (o, i) => o[0] > i[0] && o[1] < i[1],
    ],
    [
      'master curve lifts mids',
      s =>
        (s.toneCurve.master = [
          [0, 0],
          [128, 190],
          [255, 255],
        ]),
      gray(4),
      (o, i) => o[1] > i[1],
    ],
    [
      'red curve moves R only',
      s =>
        (s.toneCurve.red = [
          [0, 0],
          [128, 190],
          [255, 255],
        ]),
      gray(4),
      (o, i) => o[0] > i[0] && o[1] === i[1] && o[2] === i[2],
    ],
    [
      'green curve moves G only',
      s =>
        (s.toneCurve.green = [
          [0, 0],
          [128, 190],
          [255, 255],
        ]),
      gray(4),
      (o, i) => o[1] > i[1] && o[0] === i[0] && o[2] === i[2],
    ],
    [
      'blue curve moves B only',
      s =>
        (s.toneCurve.blue = [
          [0, 0],
          [128, 190],
          [255, 255],
        ]),
      gray(4),
      (o, i) => o[2] > i[2] && o[0] === i[0] && o[1] === i[1],
    ],
    [
      'grayscale equalises channels',
      s => (s.grayscale = true),
      color,
      o => Math.abs(o[0] - o[1]) < 1e-5 && Math.abs(o[1] - o[2]) < 1e-5,
    ],
  ];

  it.each(cases)('%s', (_name, mutate, [r, g, b], check) => {
    const base = at(
      lut(() => undefined),
      r,
      g,
      b,
    );
    const out = at(lut(mutate), r, g, b);
    expect(check(out, base)).toBe(true);
  });
});
