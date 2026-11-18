import {resolveModalSize} from '../src/lib/ui/modalDimensions';

describe('resolveModalSize', () => {
  const design = {width: 842, height: 803};

  it('scales both axes together by default on a short viewport', () => {
    const size = resolveModalSize(design, 1600, 803);
    const scale = (803 - 96) / 803;
    expect(size.width).toBeCloseTo(842 * scale);
    expect(size.height).toBeCloseTo(707);
  });

  it('keeps the design width and caps only the height with clamp', () => {
    expect(resolveModalSize({...design, fit: 'clamp'}, 1600, 803)).toEqual({
      width: 842,
      height: 707,
      decorativeHeight: undefined,
    });
  });

  it('caps the width with clamp on a narrow viewport', () => {
    expect(
      resolveModalSize({...design, fit: 'clamp'}, 800, 1200),
    ).toMatchObject({width: 704, height: 803});
  });
});
