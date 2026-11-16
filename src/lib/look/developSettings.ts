export const HSL_COLORS = [
  'red',
  'orange',
  'yellow',
  'green',
  'aqua',
  'blue',
  'purple',
  'magenta',
] as const;
export type HslColor = (typeof HSL_COLORS)[number];

export type CurvePoint = readonly [x: number, y: number];

export type DevelopSettings = {
  temperature: number;
  tint: number;
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  vibrance: number;
  saturation: number;
  hsl: Record<HslColor, { hue: number; saturation: number; luminance: number }>;
  splitToning: {
    shadowHue: number;
    shadowSaturation: number;
    highlightHue: number;
    highlightSaturation: number;
    balance: number;
  };
  midtoneGrade: { hue: number; saturation: number };
  /** Points in 0..255; an empty list is the identity curve. */
  toneCurve: Record<'master' | 'red' | 'green' | 'blue', CurvePoint[]>;
  grayscale: boolean;
  texture: number;
  clarity: number;
  dehaze: number;
  vignette: {
    amount: number;
    midpoint: number;
    feather: number;
    roundness: number;
  };
  grain: { amount: number; size: number; frequency: number };
};

export function defaultSettings(): DevelopSettings {
  const band = () => ({ hue: 0, saturation: 0, luminance: 0 });
  const hsl = {
    red: band(),
    orange: band(),
    yellow: band(),
    green: band(),
    aqua: band(),
    blue: band(),
    purple: band(),
    magenta: band(),
  };
  return {
    temperature: 0,
    tint: 0,
    exposure: 0,
    contrast: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    vibrance: 0,
    saturation: 0,
    hsl,
    splitToning: {
      shadowHue: 0,
      shadowSaturation: 0,
      highlightHue: 0,
      highlightSaturation: 0,
      balance: 0,
    },
    midtoneGrade: { hue: 0, saturation: 0 },
    toneCurve: { master: [], red: [], green: [], blue: [] },
    grayscale: false,
    texture: 0,
    clarity: 0,
    dehaze: 0,
    vignette: { amount: 0, midpoint: 50, feather: 50, roundness: 0 },
    grain: { amount: 0, size: 25, frequency: 50 },
  };
}

type NumberSetter = (s: DevelopSettings, v: number) => number;

export const NUMBER_FIELDS = new Map<string, NumberSetter>(
  Object.entries<NumberSetter>({
    IncrementalTemperature: (s, v) => (s.temperature = v),
    IncrementalTint: (s, v) => (s.tint = v),
    Exposure2012: (s, v) => (s.exposure = v),
    Contrast2012: (s, v) => (s.contrast = v),
    Highlights2012: (s, v) => (s.highlights = v),
    Shadows2012: (s, v) => (s.shadows = v),
    Whites2012: (s, v) => (s.whites = v),
    Blacks2012: (s, v) => (s.blacks = v),
    Vibrance: (s, v) => (s.vibrance = v),
    Saturation: (s, v) => (s.saturation = v),
    SplitToningShadowHue: (s, v) => (s.splitToning.shadowHue = v),
    SplitToningShadowSaturation: (s, v) =>
      (s.splitToning.shadowSaturation = v),
    SplitToningHighlightHue: (s, v) => (s.splitToning.highlightHue = v),
    SplitToningHighlightSaturation: (s, v) =>
      (s.splitToning.highlightSaturation = v),
    SplitToningBalance: (s, v) => (s.splitToning.balance = v),
    ColorGradeMidtoneHue: (s, v) => (s.midtoneGrade.hue = v),
    ColorGradeMidtoneSat: (s, v) => (s.midtoneGrade.saturation = v),
    Texture: (s, v) => (s.texture = v),
    Clarity2012: (s, v) => (s.clarity = v),
    Dehaze: (s, v) => (s.dehaze = v),
    PostCropVignetteAmount: (s, v) => (s.vignette.amount = v),
    PostCropVignetteMidpoint: (s, v) => (s.vignette.midpoint = v),
    PostCropVignetteFeather: (s, v) => (s.vignette.feather = v),
    PostCropVignetteRoundness: (s, v) => (s.vignette.roundness = v),
    GrainAmount: (s, v) => (s.grain.amount = v),
    GrainSize: (s, v) => (s.grain.size = v),
    GrainFrequency: (s, v) => (s.grain.frequency = v),
  }),
);

for (const color of HSL_COLORS) {
  const name = color[0].toUpperCase() + color.slice(1);
  NUMBER_FIELDS.set(
    `HueAdjustment${name}`,
    (s, v) => (s.hsl[color].hue = v),
  );
  NUMBER_FIELDS.set(
    `SaturationAdjustment${name}`,
    (s, v) => (s.hsl[color].saturation = v),
  );
  NUMBER_FIELDS.set(
    `LuminanceAdjustment${name}`,
    (s, v) => (s.hsl[color].luminance = v),
  );
}

export const CURVE_FIELDS = new Map<string, keyof DevelopSettings['toneCurve']>(
  Object.entries<keyof DevelopSettings['toneCurve']>({
    ToneCurvePV2012: 'master',
    ToneCurvePV2012Red: 'red',
    ToneCurvePV2012Green: 'green',
    ToneCurvePV2012Blue: 'blue',
  }),
);

export const GRAYSCALE_FIELD = 'ConvertToGrayscale';

// Preset metadata with no effect on the look: skipped, not reported as ignored.
export const BOOKKEEPING = new Set([
  'ProcessVersion',
  'PresetType',
  'Cluster',
  'UUID',
  'RequiresRGBTables',
  'ShowInPresets',
  'ShowInQuickActions',
  'CameraModelRestriction',
  'Copyright',
  'ContactInfo',
  'Version',
  'Name',
  'ShortName',
  'SortName',
  'Group',
  'Description',
  'HasSettings',
]);

export const PROFILE_TABLES = ['RGBTable', 'LookTable'];

