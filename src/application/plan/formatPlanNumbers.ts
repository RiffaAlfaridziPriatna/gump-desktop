/**
 * Locale-style number formatting matching the plan mockups
 * (e.g. 24.500 photos, 2,1 GB).
 */
export function formatPhotoCount(value: number): string {
  return Math.round(value).toLocaleString('de-DE');
}

export function formatStorageGb(value: number): string {
  const rounded =
    value >= 10 ? Math.round(value).toString() : value.toFixed(1);
  return rounded.replace('.', ',');
}

export function formatTopUpLabel(
  photoAmount: number,
  priceUsd: number,
): string {
  return `+${photoAmount.toLocaleString('en-US')} photos · ${priceUsd.toFixed(2)} USD`;
}
