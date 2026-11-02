export const DISK_SPACE_MARGIN_BYTES = 500 * 1024 * 1024;

export function hasEnoughDiskSpace(
  availableBytes: number,
  requiredBytes: number,
): boolean {
  if (
    !Number.isFinite(availableBytes) ||
    !Number.isFinite(requiredBytes) ||
    availableBytes < 0 ||
    requiredBytes < 0
  ) {
    return false;
  }
  return availableBytes >= requiredBytes + DISK_SPACE_MARGIN_BYTES;
}

/** A missing or non-positive size counts as 0; the caller reports `missingSizeCount`. */
export function estimateExportBytes(
  photos: ReadonlyArray<{file: {size: number}}>,
): {totalBytes: number; missingSizeCount: number} {
  let totalBytes = 0;
  let missingSizeCount = 0;
  for (const {file} of photos) {
    if (Number.isFinite(file.size) && file.size > 0) {
      totalBytes += file.size;
    } else {
      missingSizeCount += 1;
    }
  }
  return {totalBytes, missingSizeCount};
}
