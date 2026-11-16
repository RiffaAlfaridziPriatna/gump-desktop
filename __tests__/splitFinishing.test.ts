import {defaultSettings} from '@lib/look/developSettings';
import {splitFinishing} from '@lib/look/developToLut';

describe('splitFinishing', () => {
  it('returns null when no spatial effect is set', () => {
    expect(splitFinishing(defaultSettings())).toBeNull();
  });

  it('extracts spatial fields into LookFinishing', () => {
    const s = defaultSettings();
    s.texture = 20;
    s.clarity = -10;
    s.dehaze = 5;
    s.vignette = {amount: -30, midpoint: 40, feather: 60, roundness: 0};
    s.grain = {amount: 25, size: 30, frequency: 55};
    expect(splitFinishing(s)).toEqual({
      texture: 20,
      clarity: -10,
      dehaze: 5,
      vignetteAmount: -30,
      vignetteMidpoint: 40,
      vignetteFeather: 60,
      vignetteRoundness: 0,
      grainAmount: 25,
      grainSize: 30,
      grainRoughness: 55,
    });
  });

  it('clamps to slider ranges', () => {
    const s = defaultSettings();
    s.texture = 500;
    expect(splitFinishing(s)?.texture).toBe(100);
  });
});
