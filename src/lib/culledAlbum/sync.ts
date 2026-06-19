import {getCullingPhotoId} from '@lib/cullingPhotoId';
import {listAlbumPhotos} from '@lib/localStorage';
import {saveAlbum} from './storage';
import {
  createCulledAlbumPhoto,
  CulledAlbum,
  CulledAlbumPhoto,
  hasInFlightUploads,
  recomputeAlbumTotals,
} from './types';

export async function syncAlbumWithDisk(album: CulledAlbum): Promise<CulledAlbum> {
  const diskFiles = await listAlbumPhotos(album.albumId);
  const photosByPath = new Map(
    album.photos.map(photo => [photo.file.uri, photo]),
  );
  const merged: CulledAlbumPhoto[] = [];
  const mergedPhotoIds = new Set<string>();

  for (const file of diskFiles) {
    const existing = photosByPath.get(file.uri);
    if (existing) {
      const wasInFlight =
        existing.status === 'pending' || existing.status === 'uploading';
      merged.push({
        ...existing,
        file,
        status: wasInFlight ? 'uploaded' : existing.status,
        progress: wasInFlight ? 100 : existing.progress,
      });
      mergedPhotoIds.add(existing.photoId);
      continue;
    }

    const photo: CulledAlbumPhoto = {
      ...createCulledAlbumPhoto(file, getCullingPhotoId(file)),
      status: 'uploaded',
      progress: 100,
    };
    merged.push(photo);
    mergedPhotoIds.add(photo.photoId);
  }

  for (const photo of album.photos) {
    if (!mergedPhotoIds.has(photo.photoId)) {
      merged.push(photo);
    }
  }

  const nextAlbum: CulledAlbum = {
    ...album,
    photos: merged.sort((a, b) => a.file.name.localeCompare(b.file.name)),
  };
  recomputeAlbumTotals(nextAlbum);

  if (!hasInFlightUploads(nextAlbum)) {
    await saveAlbum(nextAlbum);
  }
  return nextAlbum;
}
