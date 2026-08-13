import type {LookColorMatrix, LookDefinition} from './types';
import {DEFAULT_LOOK_INTENSITY, type LookId} from './types';

const IDENTITY_MATRIX: LookColorMatrix = [
  1, 0, 0, 0, 0, // R
  0, 1, 0, 0, 0, // G
  0, 0, 1, 0, 0, // B
  0, 0, 0, 1, 0, // A
];

/**
 * Full-strength bake/preview matrices.
 * Fitted from Figma Apply Look reference exports (same base photo):
 * 1 Original → 2 Clean Natural → 3 Warm Romantic → 4 Film Mood
 * via percentile-matched channel affines (+ parametric refine).
 * Preview (FilterImage) and Export/Upload bake share these via resolveBakeMatrix.
 *
 * Note: Film Mood in Figma also has grain/vignette — linear matrix approximates
 * the color grade only, not texture.
 */
export const LOOK_CATALOG: readonly LookDefinition[] = [
  {
    id: 'original',
    label: 'Original',
    overlay: {
      tintColor: 'transparent',
      tintOpacity: 0,
    },
    matrix: IDENTITY_MATRIX,
  },
  {
    id: 'cleanNatural',
    label: 'Clean Natural',
    overlay: {
      tintColor: '#FFF8F0',
      tintOpacity: 0.1,
      liftOpacity: 0.18,
    },
    // Subtle lift + mild brightness; keeps colors natural (Figma #2)
    matrix: [
      1.03559, 0.00199, 0.0002, 0, 0.03155,
      0.0006, 1.04706, 0.0002, 0, 0.03489,
      0.00059, 0.00197, 1.02515, 0, 0.03657,
      0, 0, 0, 1, 0,
    ],
  },
  {
    id: 'warmRomantic',
    label: 'Warm Romantic',
    overlay: {
      tintColor: '#FF8A2A',
      tintOpacity: 0.28,
      multiplyColor: '#FFB060',
      multiplyOpacity: 0.12,
    },
    // Amber/golden-hour: hold red, pull blue hard (Figma #3)
    matrix: [
      1.07778, 0.02036, 0.03257, 0, -0.00192,
      0.00127, 0.93631, -0.00814, 0, -0.02997,
      -0.02036, -0.01222, 0.59281, 0, -0.00134,
      0, 0, 0, 1, 0,
    ],
  },
  {
    id: 'filmMood',
    label: 'Film Mood',
    overlay: {
      tintColor: '#121018',
      tintOpacity: 0.22,
      multiplyColor: '#0A0A0C',
      multiplyOpacity: 0.32,
    },
    // Dark warm vintage: crush lows, desat blues, muted midtones (Figma #4)
    matrix: [
      0.47956, 0.17576, 0.01721, 0, -0.06136,
      0.04564, 0.51051, 0.01156, 0, -0.05748,
      0.01588, 0.09263, 0.29136, 0, -0.05745,
      0, 0, 0, 1, 0,
    ],
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

export function lerpColorMatrix(
  intensityPercent: number,
  target: LookColorMatrix,
): LookColorMatrix {
  const t = Math.max(0, Math.min(1, intensityPercent / 100));
  const result = new Array(20) as number[];
  for (let index = 0; index < 20; index++) {
    result[index] =
      IDENTITY_MATRIX[index]! * (1 - t) + target[index]! * t;
  }
  return result as LookColorMatrix;
}

export function resolveBakeMatrix(
  lookId: LookId,
  intensityPercent: number = DEFAULT_LOOK_INTENSITY,
): LookColorMatrix {
  if (lookId === 'original' || intensityPercent <= 0) {
    return IDENTITY_MATRIX;
  }
  return lerpColorMatrix(intensityPercent, getLookDefinition(lookId).matrix);
}

export function scaledOverlayOpacity(
  baseOpacity: number | undefined,
  intensityPercent: number,
): number {
  if (!baseOpacity || baseOpacity <= 0) {
    return 0;
  }
  return baseOpacity * Math.max(0, Math.min(1, intensityPercent / 100));
}
