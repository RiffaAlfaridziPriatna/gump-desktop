export function getExifRotationDegrees(orientation: number | undefined): number {
  switch (orientation) {
    case 3:
      return 180;
    case 6:
      return 90;
    case 8:
      return 270;
    default:
      return 0;
  }
}

export function exifOrientationSwapsDimensions(
  orientation: number | undefined,
): boolean {
  const rotation = getExifRotationDegrees(orientation);
  return rotation === 90 || rotation === 270;
}
