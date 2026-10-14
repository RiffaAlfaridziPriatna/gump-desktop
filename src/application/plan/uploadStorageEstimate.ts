import type {ExportQuality} from '@domain/plan';
import {bytesToGigabytes} from '@lib/culledAlbum/format';

export function exportQualityLabel(quality: ExportQuality): string {
  return quality === 'original' ? 'High-Quality JPG' : 'Compressed JPG';
}

export function sumPhotoBytes(
  photos: ReadonlyArray<{file: {size?: number | null}}>,
): number {
  let total = 0;
  for (const photo of photos) {
    const size = photo.file.size;
    if (size != null && size > 0) {
      total += size;
    }
  }
  return total;
}

export function estimateUploadSizeGb(
  photos: ReadonlyArray<{file: {size?: number | null}}>,
): number {
  return bytesToGigabytes(sumPhotoBytes(photos));
}
