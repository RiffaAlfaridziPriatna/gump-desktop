export function bytesToGigabytes(bytes: number): number {
  return bytes / 1024 ** 3;
}

export function formatStorageSizeGb(gb: number): string {
  if (gb <= 0) {
    return '0.0 GB';
  }
  if (gb < 1) {
    const mb = gb * 1024;
    return mb >= 100 ? `${gb.toFixed(2)} GB` : `${Math.round(mb)} MB`;
  }
  return `${gb.toFixed(1)} GB`;
}

export function toSizesGb(
  sizeBytes: Record<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(sizeBytes).map(([id, bytes]) => [id, bytesToGigabytes(bytes)]),
  );
}
