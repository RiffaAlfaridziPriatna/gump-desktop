import {photoIdFromStoredFile} from '@lib/culling/cullingPhotoId';
import {listAlbumPhotos} from '@lib/storage/localStorage';
import {saveAlbum} from './storage';
import {getPhotosSnapshot} from './photoStateStore';
import {setPhotoOrder} from './photoLoader';
import {toPersistableAlbum} from './toPersistableAlbum';
import {
  createCulledAlbumPhoto,
  CulledAlbum,
  CulledAlbumPhoto,
  hasInFlightUploads,
  recomputeAlbumTotals,
  sortPhotosByFilename,
} from './types';

export type SyncAlbumWithDiskResult = {
  album: CulledAlbum;
  photoOrder: string[];
};

export async function syncAlbumWithDisk(
  album: CulledAlbum,
  knownPhotoIds: string[] = [],
): Promise<SyncAlbumWithDiskResult> {
  const diskFiles = await listAlbumPhotos(album.albumId);
  const livePhotos = getPhotosSnapshot(album.albumId);
  const sourcePhotos = livePhotos.length > 0 ? livePhotos : album.photos;
  const photosByPath = new Map(
    sourcePhotos.map(photo => [photo.file.uri, photo]),
  );
  const knownIds = new Set(knownPhotoIds);
  const merged: CulledAlbumPhoto[] = [];
  const mergedPhotoIds = new Set<string>();
  const orderIds = [...knownPhotoIds];

  for (const file of diskFiles) {
    if (file.uri.includes('/thumbs/')) {
      continue;
    }

    const existing = photosByPath.get(file.uri);
    const photoId = existing?.photoId ?? photoIdFromStoredFile(file);

    if (existing) {
      const wasInFlight =
        existing.status === 'pending' || existing.status === 'uploading';
      merged.push({
        ...existing,
        file: {
          ...file,
          name: existing.file.name,
        },
        status: wasInFlight ? 'uploaded' : existing.status,
        progress: wasInFlight ? 100 : existing.progress,
      });
      mergedPhotoIds.add(photoId);
      if (!orderIds.includes(photoId)) {
        orderIds.push(photoId);
      }
      continue;
    }

    if (knownIds.has(photoId)) {
      if (!orderIds.includes(photoId)) {
        orderIds.push(photoId);
      }
      continue;
    }

    const photo: CulledAlbumPhoto = {
      ...createCulledAlbumPhoto(file, photoId),
      status: 'uploaded',
      progress: 100,
    };
    merged.push(photo);
    mergedPhotoIds.add(photoId);
    orderIds.push(photoId);
  }

  for (const photo of sourcePhotos) {
    if (mergedPhotoIds.has(photo.photoId)) {
      continue;
    }
    if (
      photo.status === 'pending' ||
      photo.status === 'uploading' ||
      photo.status === 'failed'
    ) {
      merged.push(photo);
      mergedPhotoIds.add(photo.photoId);
      if (!orderIds.includes(photo.photoId)) {
        orderIds.push(photo.photoId);
      }
    }
  }

  const nextAlbum: CulledAlbum = {
    ...album,
    photos: sortPhotosByFilename(merged),
  };
  recomputeAlbumTotals(nextAlbum);

  if (!hasInFlightUploads(nextAlbum)) {
    await saveAlbum(toPersistableAlbum(nextAlbum), {includePhotos: true});
  }

  const sortedPhotoOrder = nextAlbum.photos.map(photo => photo.photoId);
  setPhotoOrder(album.albumId, sortedPhotoOrder);
  return {album: nextAlbum, photoOrder: sortedPhotoOrder};
}
