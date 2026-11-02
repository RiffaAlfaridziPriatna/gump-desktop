export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded =
    value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${rounded} ${units[unitIndex]}`;
}

const BYTES_PER_GB = 1024 ** 3;

export function formatGigabytes(bytes: number): string {
  const gb = Number.isFinite(bytes) && bytes > 0 ? bytes / BYTES_PER_GB : 0;
  if (gb > 0 && gb < 0.05) {
    return '<0.1 GB';
  }
  return `${gb.toFixed(1)} GB`;
}
