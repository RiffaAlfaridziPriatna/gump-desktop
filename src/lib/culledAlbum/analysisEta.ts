export const ETA_MIN_SAMPLE = 5;

export type AnalysisEtaInput = {
  /** Photos finished since this batch started tracking. */
  completedSinceStart: number;
  elapsedMs: number;
  remaining: number;
};

/** Whole minutes left from the observed pace, or null until the pace is trustworthy. */
export function estimateMinutesLeft({
  completedSinceStart,
  elapsedMs,
  remaining,
}: AnalysisEtaInput): number | null {
  if (completedSinceStart < ETA_MIN_SAMPLE || elapsedMs <= 0 || remaining <= 0) {
    return null;
  }
  const msLeft = (remaining * elapsedMs) / completedSinceStart;
  return Math.max(1, Math.ceil(msLeft / 60000));
}

export function formatEtaLabel(minutes: number): string {
  return `About ${minutes} min left`;
}
