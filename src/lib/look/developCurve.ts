import type { CurvePoint } from './developSettings';

export type Curve = (x: number) => number;

const IDENTITY: Curve = x => x;

/** Clamps to [min, max]; a non-finite value reads as 0 (the slider default). */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return value < min ? min : value > max ? max : value;
}

// GUMP approximation: Fritsch-Carlson monotone cubic through points given in 0..255.
export function buildCurve(points: readonly CurvePoint[]): Curve {
  const sorted = points
    .map(([x, y]) => [clamp(x, 0, 255) / 255, clamp(y, 0, 255) / 255])
    .sort((a, b) => a[0] - b[0])
    .filter((p, i, all) => i === 0 || p[0] > all[i - 1][0]);
  const n = sorted.length;
  if (n < 2) {
    return IDENTITY;
  }
  const xs = sorted.map(p => p[0]);
  const ys = sorted.map(p => p[1]);
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  }
  const m = xs.map((_, i) =>
    i === 0
      ? d[0]
      : i === n - 1
      ? d[n - 2]
      : d[i - 1] * d[i] <= 0
      ? 0
      : (d[i - 1] + d[i]) / 2,
  );
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return x => {
    if (x <= xs[0]) {
      return ys[0];
    }
    if (x >= xs[n - 1]) {
      return ys[n - 1];
    }
    let i = 0;
    while (x > xs[i + 1]) {
      i++;
    }
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h * m[i + 1]
    );
  };
}
