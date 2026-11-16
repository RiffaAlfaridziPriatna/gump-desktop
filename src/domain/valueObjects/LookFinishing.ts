/** [min, max, default] per Lightroom slider. grainRoughness is crs:GrainFrequency. */
const LOOK_FINISHING_RANGES = {
  texture: [-100, 100, 0],
  clarity: [-100, 100, 0],
  dehaze: [-100, 100, 0],
  vignetteAmount: [-100, 100, 0],
  vignetteMidpoint: [0, 100, 50],
  vignetteFeather: [0, 100, 50],
  vignetteRoundness: [-100, 100, 0],
  grainAmount: [0, 100, 0],
  grainSize: [0, 100, 25],
  grainRoughness: [0, 100, 50],
} as const;

export type LookFinishingField = keyof typeof LOOK_FINISHING_RANGES;

export type LookFinishing = Readonly<Record<LookFinishingField, number>>;

/** One custom preset per album; the .cube path derives from album id + revision. */
export type CustomLook = Readonly<{
  name: string;
  revision: string;
  finishing: LookFinishing | null;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Revision becomes part of the .cube file path, so it must stay a safe file-name segment.
const REVISION_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_NAME_LENGTH = 255;

/** Clamps each field to its slider range; missing or non-finite values take the default. */
export function parseLookFinishing(value: unknown): LookFinishing | null {
  if (!isRecord(value)) {
    return null;
  }
  const entries = Object.entries(LOOK_FINISHING_RANGES).map(
    ([field, [min, max, fallback]]) => {
      const raw = value[field];
      const next =
        typeof raw === 'number' && Number.isFinite(raw)
          ? Math.min(max, Math.max(min, raw))
          : fallback;
      return [field, next] as const;
    },
  );
  return Object.fromEntries(entries) as LookFinishing; // keys come from LOOK_FINISHING_RANGES
}

/** Malformed input (bad name or revision, non-object) reads as no custom look. */
export function parseCustomLook(value: unknown): CustomLook | null {
  if (
    !isRecord(value) ||
    typeof value.name !== 'string' ||
    typeof value.revision !== 'string' ||
    !REVISION_PATTERN.test(value.revision)
  ) {
    return null;
  }
  const name = value.name.trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) {
    return null;
  }
  return {
    name,
    revision: value.revision,
    finishing: parseLookFinishing(value.finishing),
  };
}

export function requireCustomLook(value: unknown): CustomLook {
  const customLook = parseCustomLook(value);
  if (!customLook) {
    throw new Error('Invalid custom look: bad name or revision');
  }
  return customLook;
}
