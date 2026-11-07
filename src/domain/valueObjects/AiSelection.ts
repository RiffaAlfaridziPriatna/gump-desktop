export const AI_SELECTION_LEVELS = ['fewer', 'balanced', 'more'] as const;

export type AiSelectionLevel = (typeof AI_SELECTION_LEVELS)[number];

export const DEFAULT_AI_SELECTION_LEVEL: AiSelectionLevel = 'balanced';

export const AI_SELECTION_MIN_STARS: Record<AiSelectionLevel, number> = {
  fewer: 5,
  balanced: 4,
  more: 3,
};

export function isAiSelectionLevel(value: unknown): value is AiSelectionLevel {
  return (
    typeof value === 'string' &&
    (AI_SELECTION_LEVELS as readonly string[]).includes(value)
  );
}

/** Unrated (null, undefined, 0, NaN) is never recommended. */
export function isRecommendedAtLevel(
  starRating: number | null | undefined,
  level: AiSelectionLevel,
): boolean {
  return (
    typeof starRating === 'number' &&
    starRating >= AI_SELECTION_MIN_STARS[level]
  );
}
