import {parseCube} from '@lib/look/cubeParser';

function rows(n: number, scale = 1): string[] {
  const out: string[] = [];
  const f = (v: number) => ((v / (n - 1)) * scale).toFixed(4);
  for (let b = 0; b < n; b++) {
    for (let g = 0; g < n; g++) {
      for (let r = 0; r < n; r++) {
        out.push(`${f(r)} ${f(g)} ${f(b)}`);
      }
    }
  }
  return out;
}

function cube(n: number, header: string[] = [], body = rows(n)): string {
  return [`LUT_3D_SIZE ${n}`, ...header, ...body].join('\n');
}

function failure(text: string) {
  const result = parseCube(text);
  if (result.ok) {
    throw new Error('expected failure');
  }
  return result;
}

describe('parseCube', () => {
  it('parses a valid cube into canonical text', () => {
    expect(parseCube(cube(2))).toEqual({
      ok: true,
      size: 2,
      canonicalText: `LUT_3D_SIZE 2\n${rows(2).join('\n')}\n`,
    });
  });

  it('H1: keyword lines are never data rows', () => {
    const header = [
      'TITLE "x"',
      '# comment',
      '',
      'LUT_3D_INPUT_RANGE 0.0 1.0',
      'DOMAIN_MIN 0 0 0',
      'DOMAIN_MAX 1 1 1',
    ];
    const result = parseCube(cube(2, header));
    expect(result.ok).toBe(true);
    if (result.ok) {
      const lines = result.canonicalText.trim().split('\n');
      expect(lines).toHaveLength(1 + 8);
      expect(lines[1]).toBe(rows(2)[0]);
    }
  });

  function lattice(result: ReturnType<typeof parseCube>): number[][] {
    if (!result.ok) {
      throw new Error(result.detail);
    }
    return result.canonicalText
      .trim()
      .split('\n')
      .slice(1)
      .map(line => line.split(' ').map(Number));
  }

  // Identity cube over input 0..max: output value equals the node's input.
  function identityOver(n: number, max: number): string[] {
    return rows(n, max);
  }

  it('H2: DOMAIN_MAX 2 2 2 resamples to an identity over input 0..1', () => {
    const result = parseCube(cube(3, ['DOMAIN_MAX 2 2 2'], identityOver(3, 2)));
    const out = lattice(result);
    expect(out).toHaveLength(27);
    out.forEach((row, i) => {
      const [r, g, b] = [i % 3, Math.floor(i / 3) % 3, Math.floor(i / 9)];
      [r, g, b].forEach((node, c) => expect(row[c]).toBeCloseTo(node / 2, 5));
    });
  });

  it('domain 0..0.5 clamps at the source edge', () => {
    const header = ['DOMAIN_MAX 0.5 0.5 0.5'];
    const out = lattice(parseCube(cube(3, header, identityOver(3, 0.5))));
    expect(out[1][0]).toBeCloseTo(0.5, 5);
    expect(out[2][0]).toBeCloseTo(0.5, 5);
    expect(out[0][0]).toBe(0);
    expect(out.flat().every(v => v >= 0 && v <= 1)).toBe(true);
  });

  it('DOMAIN_MIN below zero shifts the input range', () => {
    const header = ['DOMAIN_MIN -1 -1 -1'];
    const out = lattice(parseCube(cube(3, header, rows(3))));
    expect(out[0][0]).toBeCloseTo(0.5, 5);
    expect(out[2][0]).toBeCloseTo(1, 5);
  });

  it('rejects a domain whose span is not finite', () => {
    const text = cube(2, ['DOMAIN_MIN -1e308 0 0', 'DOMAIN_MAX 1e308 1 1']);
    expect(failure(text).reason).toBe('unsupported');
  });

  it('ReDoS: a huge numeric-looking token returns quickly', () => {
    const start = Date.now();
    const text = cube(
      2,
      [],
      [`${'1'.repeat(100000)}x 0 0`, ...rows(2).slice(1)],
    );
    expect(failure(text).reason).toBe('unreadable');
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('stops buffering rows beyond size^3', () => {
    const text = cube(2, [], [...rows(2), ...Array(5000).fill('0 0 0')]);
    expect(failure(text).detail).toMatch(/more data rows/);
  });

  it('caps rows at 65^3 when the size is not yet known', () => {
    const text = Array(65 ** 3 + 1)
      .fill('0 0 0')
      .join('\n');
    expect(failure(text).reason).toBe('unreadable');
  });

  it('truncates a long unknown keyword in detail', () => {
    const detail = failure(cube(2, [`LUT_${'A'.repeat(1000)} 3`])).detail;
    expect(detail.length).toBeLessThan(100);
  });

  it('LUT_3D_INPUT_RANGE a b acts as DOMAIN on all channels', () => {
    const result = parseCube(cube(2, ['LUT_3D_INPUT_RANGE 0 2'], rows(2, 2)));
    expect(result.ok && result.canonicalText.split('\n')[8]).toBe(
      '1.000000 1.000000 1.000000',
    );
  });

  it('clamps out-of-range values to 0..1', () => {
    const result = parseCube(cube(2, [], ['1.5 -0.5 0', ...rows(2).slice(1)]));
    expect(result.ok && result.canonicalText.split('\n')[1]).toBe(
      '1.000000 0.000000 0',
    );
  });

  it('accepts the largest size 65', () => {
    expect(parseCube(cube(65)).ok).toBe(true);
  });

  it('handles CRLF line endings', () => {
    expect(parseCube(cube(2).replace(/\n/g, '\r\n')).ok).toBe(true);
  });

  it.each([
    ['LUT_1D_SIZE', 'LUT_1D_SIZE 4\n0 0 0\n1 1 1\n0 0 0\n1 1 1'],
    ['no LUT_3D_SIZE', '0 0 0\n1 1 1'],
    ['size 1', cube(1)],
    ['size 66', 'LUT_3D_SIZE 66\n'],
    ['size not an integer', 'LUT_3D_SIZE 2.5\n'],
    ['DOMAIN min >= max', cube(2, ['DOMAIN_MIN 1 1 1', 'DOMAIN_MAX 1 1 1'])],
    ['DOMAIN non-numeric', cube(2, ['DOMAIN_MAX a b c'])],
    ['DOMAIN wrong count', cube(2, ['DOMAIN_MAX 1 1'])],
    ['unknown keyword', cube(2, ['LUT_FOO 3'])],
  ])('unsupported: %s', (_name, text) => {
    expect(failure(text).reason).toBe('unsupported');
  });

  it.each([
    ['empty', ''],
    ['whitespace only', '  \n\t'],
    ['replacement char', `${cube(2)}�`],
    ['NUL', `${cube(2)}\u0000`],
    ['missing rows', cube(2, [], rows(2).slice(1))],
    ['surplus rows', cube(2, [], [...rows(2), '0 0 0'])],
    ['non-numeric row', cube(2, [], ['a b c', ...rows(2).slice(1)])],
    ['short row', cube(2, [], ['0 0', ...rows(2).slice(1)])],
    ['NaN', cube(2, [], ['NaN 0 0', ...rows(2).slice(1)])],
    ['Infinity', cube(2, [], ['1e999 0 0', ...rows(2).slice(1)])],
    ['over 16 MB', 'x'.repeat(16 * 1024 * 1024 + 1)],
  ])('unreadable: %s', (_name, text) => {
    expect(failure(text).reason).toBe('unreadable');
  });
});
