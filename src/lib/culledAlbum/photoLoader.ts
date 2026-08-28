import {container} from '@di/container';
import {TOKENS} from '@di/tokens';
import {IPhotoRepository} from '@domain/repositories/IPhotoRepository';
import {CulledAlbumPhoto, comparePhotosByFilename} from './types';
import {domainPhotoToLegacy} from './photoMapper';
import {
  bumpPhotoGridRevision,
  photoKey,
  photoStateStore,
} from './photoStateStore';
import {putCachedImageDimensions} from '@lib/media/imageDimensions';
import {isUsableThumbnailUri} from '@lib/storage/localStorage';

export function getPhotoIdsForAlbum(albumId: string): string[] {
  const order = photoStateStore.getState().photoOrder[albumId];
  if (order && order.length > 0) {
    return order;
  }
  return container
    .resolve<IPhotoRepository>(TOKENS.IPhotoRepository)
    .findPhotoIds(albumId);
}

export function setPhotoOrder(albumId: string, photoIds: string[]): void {
  photoStateStore.setState(state => {
    const idSet = new Set(photoIds);
    const prevPhotoIds = state.photoOrder[albumId] ?? [];
    for (const prevPhotoId of prevPhotoIds) {
      if (idSet.has(prevPhotoId)) {
        continue;
      }
      const photo = state.photoState[photoKey(albumId, prevPhotoId)];
      if (
        photo &&
        (photo.status === 'pending' ||
          photo.status === 'uploading' ||
          photo.status === 'uploaded')
      ) {
        continue;
      }
      delete state.photoState[photoKey(albumId, prevPhotoId)];
    }
    state.photoOrder[albumId] = photoIds;
  });
}

export function hydratePhotos(
  albumId: string,
  photoIds: string[],
): CulledAlbumPhoto[] {
  if (photoIds.length === 0) {
    return [];
  }

  const photoRepo = container.resolve<IPhotoRepository>(TOKENS.IPhotoRepository);
  const state = photoStateStore.getState();
  const missingIds = photoIds.filter(
    photoId => !state.photoState[photoKey(albumId, photoId)],
  );

  if (missingIds.length > 0) {
    const loaded: CulledAlbumPhoto[] = [];
    const failedIds: string[] = [];
    for (const photoId of missingIds) {
      const photo = photoRepo.findById(albumId, photoId);
      if (photo) {
        loaded.push(domainPhotoToLegacy(photo));
      } else {
        failedIds.push(photoId);
      }
    }

    if (failedIds.length > 0) {
      console.warn(
        `[photoLoader] Failed to hydrate ${failedIds.length} photo(s) from DB`,
        {albumId, failedIds: failedIds.slice(0, 10)},
      );
    }

    if (loaded.length > 0) {
      photoStateStore.setState(nextState => {
        for (const photo of loaded) {
          nextState.photoState[photoKey(albumId, photo.photoId)] = photo;
          seedThumbnailDimensionCache(photo);
        }
      });
      bumpPhotoGridRevision(albumId);
    }
  }

  const nextState = photoStateStore.getState();
  const hydrated = photoIds
    .map(photoId => nextState.photoState[photoKey(albumId, photoId)])
    .filter((photo): photo is CulledAlbumPhoto => Boolean(photo));
  for (const photo of hydrated) {
    seedThumbnailDimensionCache(photo);
  }
  return hydrated;
}

function seedThumbnailDimensionCache(photo: CulledAlbumPhoto): void {
  const uri = photo.file.thumbnailUri;
  const width = photo.file.thumbnailWidth;
  const height = photo.file.thumbnailHeight;
  if (
    !isUsableThumbnailUri(uri) ||
    width == null ||
    height == null ||
    width <= 0 ||
    height <= 0
  ) {
    return;
  }
  putCachedImageDimensions(uri, {width, height});
}

export function hydrateAllPhotos(albumId: string): CulledAlbumPhoto[] {
  return hydratePhotos(albumId, getPhotoIdsForAlbum(albumId));
}

export function ensurePhotoOrder(albumId: string): string[] {
  const order = photoStateStore.getState().photoOrder[albumId];
  if (order && order.length > 0) {
    return order;
  }
  const photoIds = container
    .resolve<IPhotoRepository>(TOKENS.IPhotoRepository)
    .findPhotoIds(albumId);
  setPhotoOrder(albumId, photoIds);
  return photoIds;
}

export function alignPhotoOrderByFilename(albumId: string): string[] {
  const photoIds = ensurePhotoOrder(albumId);
  if (photoIds.length <= 1) {
    return photoIds;
  }

  const currentOrder = photoIds.join(':');
  const state = photoStateStore.getState();
  const hydratedPhotos = photoIds
    .map(photoId => state.photoState[photoKey(albumId, photoId)])
    .filter((photo): photo is CulledAlbumPhoto => Boolean(photo));

  let sortedIds: string[];
  if (hydratedPhotos.length === photoIds.length) {
    sortedIds = [...hydratedPhotos]
      .sort(comparePhotosByFilename)
      .map(photo => photo.photoId);
  } else {
    const photoRepo = container.resolve<IPhotoRepository>(TOKENS.IPhotoRepository);
    sortedIds = photoRepo
      .findByAlbum(albumId)
      .map(domainPhotoToLegacy)
      .sort(comparePhotosByFilename)
      .map(photo => photo.photoId);
  }

  if (sortedIds.join(':') === currentOrder) {
    return photoIds;
  }

  setPhotoOrder(albumId, sortedIds);
  return sortedIds;
}
