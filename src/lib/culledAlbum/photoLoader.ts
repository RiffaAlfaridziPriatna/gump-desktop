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
    for (const photoId of missingIds) {
      const photo = photoRepo.findById(albumId, photoId);
      if (photo) {
        loaded.push(domainPhotoToLegacy(photo));
      }
    }

    if (loaded.length > 0) {
      photoStateStore.setState(nextState => {
        for (const photo of loaded) {
          nextState.photoState[photoKey(albumId, photo.photoId)] = photo;
        }
      });
      bumpPhotoGridRevision(albumId);
    }
  }

  const nextState = photoStateStore.getState();
  return photoIds
    .map(photoId => nextState.photoState[photoKey(albumId, photoId)])
    .filter((photo): photo is CulledAlbumPhoto => Boolean(photo));
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
