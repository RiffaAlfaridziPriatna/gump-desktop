const MS_PER_PHOTO = 100;
const MIN_MS = 1000;
const MAX_MS = 5000;

export function getSimulatedUploadBatchDurationMs(photoCount: number): number {
  return Math.min(MAX_MS, Math.max(MIN_MS, photoCount * MS_PER_PHOTO));
}

export function getSimulatedUploadPerItemMinDurationMs(
  photoCount: number,
  concurrency: number,
): number {
  if (photoCount <= 0) return 0;
  const c = Math.max(1, concurrency);
  const batchMs = getSimulatedUploadBatchDurationMs(photoCount);
  return Math.ceil((batchMs * c) / photoCount);
}
