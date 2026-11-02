export type HitFrame = {x: number; y: number; width: number; height: number};

const CHROME_HIT_PADDING = 6;

export function isInsideHit(x: number, y: number, frame: HitFrame): boolean {
  return (
    x >= frame.x - CHROME_HIT_PADDING &&
    x <= frame.x + frame.width + CHROME_HIT_PADDING &&
    y >= frame.y - CHROME_HIT_PADDING &&
    y <= frame.y + frame.height + CHROME_HIT_PADDING
  );
}

export function starIndexFromHit(
  x: number,
  frame: HitFrame,
  slotWidth: number,
): number {
  return Math.min(4, Math.max(0, Math.floor((x - frame.x) / slotWidth)));
}
