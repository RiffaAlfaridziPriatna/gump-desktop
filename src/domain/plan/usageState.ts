import {PHOTO_USAGE_WARNING_RATIO} from './catalog';
import type {PhotoUsageState} from './types';

export function resolvePhotoUsageState(
  used: number,
  limit: number | null,
): PhotoUsageState {
  if (limit == null || limit <= 0) {
    return 'normal';
  }
  if (used >= limit) {
    return 'limit';
  }
  if (used / limit >= PHOTO_USAGE_WARNING_RATIO) {
    return 'warning';
  }
  return 'normal';
}
