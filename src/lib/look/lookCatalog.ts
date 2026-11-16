import type {LookDefinition, LookId, NativeLookFinishing} from './types';

/**
 * Apply Look catalog. Grade source of truth is the Lightroom-trained .cube
 * LUTs bundled under Looks/ (cleanNatural / warmRomantic / filmMood).
 *
 * Film Mood: smooth curve70 + warm + pull20 baked into filmMood.cube
 * (avoids HALD posterization on 8-bit JPEG). Native finishing adds frame
 * ellipse vignette Amount −30 / Midpoint 40 / Feather 75 (FM_latest_03b).
 */
export const LOOK_CATALOG: readonly LookDefinition[] = [
  {
    id: 'original',
    label: 'Original',
  },
  {
    id: 'cleanNatural',
    label: 'Clean Natural',
    lutName: 'cleanNatural',
    finishing: {
      texture: -5,
      clarity: -5,
      dehaze: 0,
      vignetteAmount: 0,
      vignetteMidpoint: 50,
      vignetteFeather: 75,
      vignetteRoundness: 0,
      grainAmount: 0,
      grainSize: 25,
      grainRoughness: 45,
      warmNudge: 0,
      settleNudge: 0,
      vignetteFrameEllipse: false,
    },
  },
  {
    id: 'warmRomantic',
    label: 'Warm Romantic',
    lutName: 'warmRomantic',
    finishing: {
      texture: -5,
      clarity: -8,
      dehaze: -3,
      vignetteAmount: -8,
      vignetteMidpoint: 45,
      vignetteFeather: 75,
      vignetteRoundness: 0,
      grainAmount: 10,
      grainSize: 25,
      grainRoughness: 45,
      warmNudge: 0.045,
      settleNudge: 0.035,
      vignetteFrameEllipse: false,
    },
  },
  {
    id: 'filmMood',
    label: 'Film Mood',
    lutName: 'filmMood',
    finishing: {
      texture: -3,
      clarity: 0,
      dehaze: 0,
      vignetteAmount: -30,
      vignetteMidpoint: 40,
      vignetteFeather: 75,
      vignetteRoundness: 0,
      grainAmount: 0,
      grainSize: 25,
      grainRoughness: 45,
      warmNudge: 0,
      settleNudge: 0,
      vignetteFrameEllipse: true,
    },
  },
] as const;

const LOOK_BY_ID = new Map(
  LOOK_CATALOG.map(definition => [definition.id, definition]),
);

export function getLookDefinition(lookId: LookId): LookDefinition {
  return LOOK_BY_ID.get(lookId) ?? LOOK_CATALOG[0]!;
}

/** 'custom' is labelled with the album's preset name; built-ins come from the catalog. */
export function getLookLabel(
  lookId: LookId,
  customLookName?: string | null,
): string {
  if (lookId === 'custom') {
    return customLookName || 'Custom';
  }
  return getLookDefinition(lookId).label;
}

export function resolveLookLutName(lookId: LookId): string | null {
  if (lookId === 'original') {
    return null;
  }
  return getLookDefinition(lookId).lutName ?? lookId;
}

/** Finishing for the native bake; undefined (original, custom) means none. */
export function resolveLookFinishing(
  lookId: LookId,
): NativeLookFinishing | undefined {
  return getLookDefinition(lookId).finishing;
}
