import {FileAsset} from '@services/upload/types';

const UNSUPPORTED_EXTENSIONS = new Set(['webp']);

export const UNSUPPORTED_UPLOAD_FORMAT_ERROR =
  'WebP images are not supported for upload';

export function isSupportedCullingImageFormat(file: FileAsset): boolean {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (UNSUPPORTED_EXTENSIONS.has(ext)) {
    return false;
  }

  const type = file.type.trim().toLowerCase();
  return type !== 'image/webp' && type !== 'public.webp';
}

export function filterSupportedCullingImages(files: FileAsset[]): FileAsset[] {
  return files.filter(isSupportedCullingImageFormat);
}

export function partitionUploadablePhotoIds(
  photos: Array<{photoId: string; file: FileAsset}>,
  photoIds: string[],
): {uploadablePhotoIds: string[]; unsupportedPhotoIds: string[]} {
  const uploadablePhotoIds: string[] = [];
  const unsupportedPhotoIds: string[] = [];
  const photosById = new Map(photos.map(photo => [photo.photoId, photo]));

  for (const photoId of photoIds) {
    const photo = photosById.get(photoId);
    if (photo && isSupportedCullingImageFormat(photo.file)) {
      uploadablePhotoIds.push(photoId);
      continue;
    }
    unsupportedPhotoIds.push(photoId);
  }

  return {uploadablePhotoIds, unsupportedPhotoIds};
}

