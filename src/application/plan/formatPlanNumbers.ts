/**
 * Locale-style number formatting matching the plan mockups
 * (e.g. 24,500 photos, 2,1 GB).
 *
 * Avoid Number#toLocaleString — Hermes often ignores locale and emits
 * fixed 6-decimal floats (e.g. "174.000000").
 */
function formatIntegerEnUs(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded < 0 ? '-' : '';
  const digits = Math.abs(rounded).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatPhotoCount(value: number): string {
  return formatIntegerEnUs(value);
}

export function formatStorageGb(value: number): string {
  const rounded = value >= 10 ? Math.round(value).toString() : value.toFixed(1);
  return rounded.replace('.', ',');
}

export function formatTopUpLabel(
  photoAmount: number,
  priceUsd: number,
): string {
  return `+${formatIntegerEnUs(photoAmount)} photos · ${priceUsd.toFixed(
    2,
  )} USD`;
}
