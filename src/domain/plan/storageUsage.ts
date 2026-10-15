import {PHOTO_USAGE_WARNING_RATIO} from './catalog';

export type StorageProjectionState = 'ok' | 'warning' | 'exceeded';

/**
 * Projects storage usage after an upload and classifies ok / near-limit / over-limit.
 * Uses the same 90% warning threshold as photo processing capacity.
 */
export function resolveStorageProjectionState(
  usedGb: number,
  uploadGb: number,
  limitGb: number | null,
): StorageProjectionState {
  if (limitGb == null || limitGb <= 0) {
    return 'ok';
  }

  const afterGb = usedGb + uploadGb;
  if (afterGb > limitGb) {
    return 'exceeded';
  }
  if (afterGb / limitGb >= PHOTO_USAGE_WARNING_RATIO) {
    return 'warning';
  }
  return 'ok';
}
