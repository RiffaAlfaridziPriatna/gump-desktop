export const LOOK_IDS = [
  'original',
  'cleanNatural',
  'warmRomantic',
  'filmMood',
  'custom',
] as const;

export type LookId = (typeof LOOK_IDS)[number];

export function isLookId(value: unknown): value is LookId {
  return (
    typeof value === 'string' &&
    (LOOK_IDS as readonly string[]).includes(value)
  );
}

/** Unknown ids, and 'custom' when the album has no custom look, resolve to 'original'. */
export function resolveLookId(value: unknown, hasCustomLook: boolean): LookId {
  if (!isLookId(value) || (value === 'custom' && !hasCustomLook)) {
    return 'original';
  }
  return value;
}
