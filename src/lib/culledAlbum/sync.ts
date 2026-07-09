import {photoIdFromStoredFile} from '@lib/culling/cullingPhotoId';
import {listAlbumPhotos} from '@lib/storage/localStorage';
import {saveAlbum} from './storage';
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
  const photosByPath = new Map(
    album.photos.map(photo => [photo.file.uri, photo]),
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
        file,
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

  for (const photo of album.photos) {
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
  nextAlbum.totalPhotos = orderIds.length;
  recomputeAlbumTotals(nextAlbum);

  if (!hasInFlightUploads(nextAlbum)) {
    await saveAlbum(toPersistableAlbum(nextAlbum), {includePhotos: true});
  }

  setPhotoOrder(album.albumId, orderIds);
  return {album: nextAlbum, photoOrder: orderIds};
}
