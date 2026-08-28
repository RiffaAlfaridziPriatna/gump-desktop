import {syncPhotoFromStore} from '@/application/syncPhotoRepository';
import {
  getFileThumbnailDimensions,
  putCachedImageDimensions,
  type ImageDimensions,
} from '@lib/media/imageDimensions';
import {isUsableThumbnailUri} from '@lib/storage/localStorage';
import {photoKey, photoStateStore} from './photoStateStore';

export function persistThumbnailDimensions(
  albumId: string,
  photoId: string,
  dimensions: ImageDimensions,
): void {
  if (dimensions.width <= 0 || dimensions.height <= 0) {
    return;
  }

  const key = photoKey(albumId, photoId);
  let shouldSync = false;
  let thumbnailUri: string | undefined;

  photoStateStore.setState(state => {
    const photo = state.photoState[key];
    if (!photo) {
      return;
    }
    if (getFileThumbnailDimensions(photo.file)) {
      return;
    }
    photo.file = {
      ...photo.file,
      thumbnailWidth: dimensions.width,
      thumbnailHeight: dimensions.height,
    };
    thumbnailUri = photo.file.thumbnailUri;
    shouldSync = true;
  });

  if (thumbnailUri && isUsableThumbnailUri(thumbnailUri)) {
    putCachedImageDimensions(thumbnailUri, dimensions);
  }

  if (shouldSync) {
    syncPhotoFromStore(albumId, photoId);
  }
}
