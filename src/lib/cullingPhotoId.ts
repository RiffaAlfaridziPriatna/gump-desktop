import {FileAsset} from '@services/upload/types';

export function getCullingPhotoId(file: FileAsset): string {
  return `${file.name}-${file.size ?? 0}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}
