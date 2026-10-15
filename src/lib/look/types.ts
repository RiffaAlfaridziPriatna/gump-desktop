export const LOOK_IDS = [
  'original',
  'cleanNatural',
  'warmRomantic',
  'filmMood',
] as const;

export type LookId = (typeof LOOK_IDS)[number];

export const DEFAULT_LOOK_INTENSITY = 80;

export type LookDefinition = {
  id: LookId;
  label: string;
  /**
   * Bundled .cube basename without extension (macOS Looks/, Windows Assets/Looks/).
   * Omitted for original.
   */
  lutName?: string;
};

export function isLookId(value: unknown): value is LookId {
  return (
    typeof value === 'string' &&
    (LOOK_IDS as readonly string[]).includes(value)
  );
}

export function normalizeLookIntensity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_LOOK_INTENSITY;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function hasAppliedLook(
  lookId: LookId | null | undefined,
): lookId is Exclude<LookId, 'original'> {
  return lookId != null && lookId !== 'original';
}
