import type {BakedUploadFile} from '@lib/look/uploadLookBake';
import type {FileAsset} from '@services/upload/types';
import type {CulledAlbumPhoto} from './types';

/** Build the FileAsset for multipart upload, using baked look bytes when present. */
export function resolveUploadFileAsset(
  photo: CulledAlbumPhoto,
  baked?: BakedUploadFile | null,
): FileAsset {
  if (!baked?.uri || !(baked.size > 0)) {
    return photo.file;
  }

  const baseName = photo.file.name.replace(/\.[^.]+$/, '') || photo.photoId;
  return {
    ...photo.file,
    uri: baked.uri,
    name: `${baseName}.jpg`,
    type: 'image/jpeg',
    size: baked.size,
  };
}
