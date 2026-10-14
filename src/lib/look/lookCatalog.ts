import {DEFAULT_LOOK_INTENSITY, type LookDefinition, type LookId} from './types';

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

const LOOK_BY_ID = new Map(
  LOOK_CATALOG.map(definition => [definition.id, definition]),
);

export function getLookDefinition(lookId: LookId): LookDefinition {
  return LOOK_BY_ID.get(lookId) ?? LOOK_CATALOG[0]!;
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
