export const LOOK_IDS = [
  'original',
  'cleanNatural',
  'warmRomantic',
  'filmMood',
] as const;

export type LookId = (typeof LOOK_IDS)[number];

export const DEFAULT_LOOK_INTENSITY = 80;

export type LookOverlayRecipe = {
  /** Solid tint over the image (rgba). */
  tintColor: string;
  /** Opacity of tint layer after intensity scaling (0–1 at full intensity). */
  tintOpacity: number;
  /** Optional multiply/darken layer for film contrast. */
  multiplyColor?: string;
  multiplyOpacity?: number;
  /** Brightness boost via white overlay (0–1 at full intensity). */
  liftOpacity?: number;
};

/** 5x4 color matrix row-major: R', G', B', A' each from RGBA + offset. */
export type LookColorMatrix = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export type LookDefinition = {
  id: LookId;
  label: string;
  overlay: LookOverlayRecipe;
  /** Full-strength bake matrix; lerped with identity by intensity. */
  matrix: LookColorMatrix;
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
