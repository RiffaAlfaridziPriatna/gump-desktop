import {CulledAlbumPhoto, isAnalysisInFlight, isUploadInFlight} from './types';

function preferPhoto(
  existing: CulledAlbumPhoto,
  incoming: CulledAlbumPhoto,
): CulledAlbumPhoto {
  const incomingInFlight = isUploadInFlight(incoming);
  const existingInFlight = isUploadInFlight(existing);

  if (incomingInFlight) {
    return incoming;
  }
  if (existingInFlight) {
    return existing;
  }

  if (isAnalysisInFlight(incoming)) {
    return incoming;
  }
  if (isAnalysisInFlight(existing)) {
    return existing;
  }
  if (incoming.status === 'uploaded' && existing.status !== 'uploaded') {
    return incoming;
  }
  if (existing.status === 'uploaded' && incoming.status !== 'uploaded') {
    return existing;
  }
  return incoming;
}

export function mergeAlbumPhotos(
  basePhotos: CulledAlbumPhoto[],
  incomingPhotos: CulledAlbumPhoto[],
): CulledAlbumPhoto[] {
  const photosById = new Map(basePhotos.map(photo => [photo.photoId, photo]));

  for (const photo of incomingPhotos) {
    const existing = photosById.get(photo.photoId);
    photosById.set(
      photo.photoId,
      existing ? preferPhoto(existing, photo) : photo,
    );
  }

  return [...photosById.values()];
}

export function mergeWithMemoryAlbum(
  persisted: CulledAlbumPhoto[],
  memory: CulledAlbumPhoto[] | null | undefined,
): CulledAlbumPhoto[] {
  if (!memory?.length) {
    return persisted;
  }
  return mergeAlbumPhotos(persisted, memory);
}
