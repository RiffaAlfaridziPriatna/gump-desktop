export type ParseFailure = {
  ok: false;
  reason: 'unsupported' | 'unreadable';
  detail: string;
};

export type CubeParseResult =
  | {ok: true; size: number; canonicalText: string}
  | ParseFailure;

export const MIN_LUT_SIZE = 2;
export const MAX_LUT_SIZE = 65;

// Counts UTF-16 units, not bytes: it bounds parser memory only. The file
// reader (s9g) enforces the 16 MB byte cap before decoding.
export const MAX_INPUT_LENGTH = 16 * 1024 * 1024;

const KEYWORD_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
const NON_FINITE_WORDS = /^(NAN|INF|INFINITY)$/;
const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const MAX_TOKEN_LENGTH = 64;
const MAX_DETAIL_TOKEN = 40;

export function clip(token: string): string {
  return token.length > MAX_DETAIL_TOKEN
    ? `${token.slice(0, MAX_DETAIL_TOKEN)}...`
    : token;
}

export function fail(
  reason: ParseFailure['reason'],
  detail: string,
): ParseFailure {
  return {ok: false, reason, detail};
}

export function toFiniteNumber(token: string): number | null {
  if (token.length > MAX_TOKEN_LENGTH || !NUMBER_PATTERN.test(token)) {
    return null;
  }
  const value = Number(token);
  return Number.isFinite(value) ? value : null;
}

export function checkTextInput(text: string): ParseFailure | null {
  if (text.trim().length === 0) {
    return fail('unreadable', 'The file is empty.');
  }
  if (text.length > MAX_INPUT_LENGTH) {
    return fail('unreadable', 'The file is larger than 16 MB.');
  }
  if (text.includes('�') || text.includes('\u0000')) {
    return fail('unreadable', 'The file is not valid text.');
  }
  return null;
}

type Domain = {min: number[]; max: number[]};

type Row = {tokens: string[]; values: number[]};

function parseNumbers(tokens: string[], count: number): number[] | null {
  if (tokens.length !== count) {
    return null;
  }
  const values: number[] = [];
  for (const token of tokens) {
    const value = toFiniteNumber(token);
    if (value === null) {
      return null;
    }
    values.push(value);
  }
  return values;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function isUnitDomain(domain: Domain): boolean {
  return domain.min.every(v => v === 0) && domain.max.every(v => v === 1);
}

function verbatimLines(rows: Row[]): string[] {
  return rows.map(({tokens, values}) =>
    values
      .map((v, c) => (v >= 0 && v <= 1 ? tokens[c] : clamp01(v).toFixed(6)))
      .join(' '),
  );
}

// DOMAIN describes the input range of the lattice, so a non-unit domain is
// resampled (trilinear) onto a canonical lattice over input 0..1. Output
// values are clamped to 0..1: a LUT cannot store values outside it.
function resampledLines(rows: Row[], n: number, domain: Domain): string[] {
  const source = (r: number, g: number, b: number) =>
    rows[r + n * (g + n * b)].values;
  const position = (index: number, c: number) => {
    const x = index / (n - 1);
    const u = (x - domain.min[c]) / (domain.max[c] - domain.min[c]);
    return clamp01(u) * (n - 1);
  };
  const lines: string[] = [];
  for (let bi = 0; bi < n; bi++) {
    for (let gi = 0; gi < n; gi++) {
      for (let ri = 0; ri < n; ri++) {
        const [ur, ug, ub] = [
          position(ri, 0),
          position(gi, 1),
          position(bi, 2),
        ];
        const [r0, g0, b0] = [Math.floor(ur), Math.floor(ug), Math.floor(ub)];
        const [r1, g1, b1] = [
          Math.min(r0 + 1, n - 1),
          Math.min(g0 + 1, n - 1),
          Math.min(b0 + 1, n - 1),
        ];
        const [fr, fg, fb] = [ur - r0, ug - g0, ub - b0];
        const out = [0, 0, 0];
        for (const [r, wr] of [
          [r0, 1 - fr],
          [r1, fr],
        ]) {
          for (const [g, wg] of [
            [g0, 1 - fg],
            [g1, fg],
          ]) {
            for (const [b, wb] of [
              [b0, 1 - fb],
              [b1, fb],
            ]) {
              const v = source(r, g, b);
              for (let c = 0; c < 3; c++) {
                out[c] += v[c] * wr * wg * wb;
              }
            }
          }
        }
        lines.push(out.map(v => clamp01(v).toFixed(6)).join(' '));
      }
    }
  }
  return lines;
}

export function parseCube(text: string): CubeParseResult {
  const rejected = checkTextInput(text);
  if (rejected) {
    return rejected;
  }

  let size: number | null = null;
  const domain: Domain = {min: [0, 0, 0], max: [1, 1, 1]};
  const rows: Row[] = [];

  for (const rawLine of text.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }
    const [head, ...args] = line.split(/\s+/);

    if (KEYWORD_PATTERN.test(head) && !NON_FINITE_WORDS.test(head)) {
      switch (head) {
        case 'TITLE':
        case 'LUT_1D_INPUT_RANGE':
          break;
        case 'LUT_1D_SIZE':
          return fail('unsupported', '1D LUTs are not supported.');
        case 'LUT_3D_SIZE': {
          const [n] = parseNumbers(args, 1) ?? [];
          if (n === undefined || !Number.isInteger(n)) {
            return fail('unsupported', 'LUT_3D_SIZE is not an integer.');
          }
          if (n < MIN_LUT_SIZE || n > MAX_LUT_SIZE) {
            return fail(
              'unsupported',
              `LUT size ${n} is outside ${MIN_LUT_SIZE} to ${MAX_LUT_SIZE}.`,
            );
          }
          size = n;
          break;
        }
        case 'DOMAIN_MIN':
        case 'DOMAIN_MAX': {
          const values = parseNumbers(args, 3);
          if (!values) {
            return fail('unsupported', `${head} needs three numbers.`);
          }
          domain[head === 'DOMAIN_MIN' ? 'min' : 'max'] = values;
          break;
        }
        case 'LUT_3D_INPUT_RANGE': {
          const values = parseNumbers(args, 2);
          if (!values) {
            return fail('unsupported', `${head} needs two numbers.`);
          }
          domain.min = [values[0], values[0], values[0]];
          domain.max = [values[1], values[1], values[1]];
          break;
        }
        default:
          return fail('unsupported', `Unknown keyword ${clip(head)}.`);
      }
      continue;
    }

    if (rows.length >= (size ?? MAX_LUT_SIZE) ** 3) {
      return fail('unreadable', 'The file has more data rows than its size.');
    }
    const values = parseNumbers([head, ...args], 3);
    if (!values) {
      return fail('unreadable', 'A data row is not three finite numbers.');
    }
    rows.push({tokens: [head, ...args], values});
  }

  if (size === null) {
    return fail('unsupported', 'LUT_3D_SIZE is missing.');
  }
  if (
    domain.min.some(
      (min, c) => !Number.isFinite(domain.max[c] - min) || min >= domain.max[c],
    )
  ) {
    return fail('unsupported', 'DOMAIN_MIN must be below DOMAIN_MAX.');
  }
  const expected = size ** 3;
  if (rows.length !== expected) {
    return fail(
      'unreadable',
      `Expected ${expected} data rows for size ${size}, found ${rows.length}.`,
    );
  }

  const lines = isUnitDomain(domain)
    ? verbatimLines(rows)
    : resampledLines(rows, size, domain);
  if (lines.some(line => /NaN|Infinity/.test(line))) {
    return fail('unreadable', 'The LUT produced non-finite values.');
  }
  return {
    ok: true,
    size,
    canonicalText: `LUT_3D_SIZE ${size}\n${lines.join('\n')}\n`,
  };
}
