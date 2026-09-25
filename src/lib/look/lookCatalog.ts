import {DEFAULT_LOOK_INTENSITY, type LookDefinition, type LookId} from './types';

/**
 * Full look definitions (including not-yet-shipped). Used for id/label resolution
 * when a photo still references a look that is hidden from the Apply Look UI.
 *
 * Each look also applies post-LUT finishing that a 3D LUT cannot carry
 * (Texture/Clarity/Dehaze, vignette, grain) from its Lightroom Develop values.
 */
const ALL_LOOK_DEFINITIONS: readonly LookDefinition[] = [
  {
    id: 'original',
    label: 'Original',
  },
  {
    id: 'cleanNatural',
    label: 'Clean Natural',
    lutName: 'cleanNatural',
  },
  {
    id: 'warmRomantic',
    label: 'Warm Romantic',
    lutName: 'warmRomantic',
  },
  {
    id: 'filmMood',
    label: 'Film Mood',
    lutName: 'filmMood',
  },
] as const;

/** Looks exposed in Apply Look UI. Film Mood hidden until validated. */
export const LOOK_CATALOG: readonly LookDefinition[] =
  ALL_LOOK_DEFINITIONS.filter(
    definition =>
      definition.id === 'original' ||
      definition.id === 'cleanNatural' ||
      definition.id === 'warmRomantic',
  );

const LOOK_BY_ID = new Map(
  ALL_LOOK_DEFINITIONS.map(definition => [definition.id, definition]),
);

export function getLookDefinition(lookId: LookId): LookDefinition {
  return LOOK_BY_ID.get(lookId) ?? ALL_LOOK_DEFINITIONS[0]!;
}

export function getLookLabel(lookId: LookId): string {
  return getLookDefinition(lookId).label;
}

export function resolveLookLutName(lookId: LookId): string | null {
  if (lookId === 'original') {
    return null;
  }
  return getLookDefinition(lookId).lutName ?? lookId;
}

export function normalizeLookIntensityPercent(
  intensityPercent: number = DEFAULT_LOOK_INTENSITY,
): number {
  return Math.max(0, Math.min(100, Math.round(intensityPercent)));
}
