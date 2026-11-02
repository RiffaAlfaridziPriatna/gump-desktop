import type { CulledAlbumPhoto } from '@lib/culledAlbum/types';
import {
  isUsableDetailUri,
  isUsableThumbnailUri,
} from '@lib/storage/localStorage';

/**
 * Oriented derivative for preview + LUT bake. Prefer the 1920 thumb over the
 * 4096 detail; never the album master on Windows (XAML Image skips EXIF).
 */
export function resolveLookPreviewUri(photo: CulledAlbumPhoto | undefined): string {
  if (!photo) {
    return '';
  }
  if (isUsableThumbnailUri(photo.file.thumbnailUri)) {
    return photo.file.thumbnailUri!;
  }
  if (isUsableDetailUri(photo.file.detailUri)) {
    return photo.file.detailUri!;
  }
  return photo.file.uri || '';
}
