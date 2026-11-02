export const LOOK_IDS = [
  'original',
  'cleanNatural',
  'warmRomantic',
  'filmMood',
] as const;

export type LookId = (typeof LOOK_IDS)[number];

export function isLookId(value: unknown): value is LookId {
  return (
    typeof value === 'string' &&
    (LOOK_IDS as readonly string[]).includes(value)
  );
}
