import {getPhotosSnapshot} from './photoStateStore';
import {CulledAlbum, CulledAlbumPhoto, hasInFlightUploads} from './types';

function toPersistablePhoto(photo: CulledAlbumPhoto): CulledAlbumPhoto {
  const {simulatedMinDurationMs: _simulated, ...rest} = photo;

  return {
    ...rest,
    progress: photo.status === 'uploaded' ? 100 : 0,
    file: {
      uri: photo.file.uri,
      name: photo.file.name,
      size: photo.file.size ?? 0,
      type: photo.file.type,
    },
  };
}

export function photosForPersist(album: CulledAlbum): CulledAlbumPhoto[] {
  const snapshot = getPhotosSnapshot(album.albumId);
  return snapshot.length > 0 ? snapshot : album.photos;
}

export function toPersistableAlbum(
  album: CulledAlbum,
  options?: {includePhotos?: boolean},
): CulledAlbum {
  const includePhotos = options?.includePhotos ?? true;
  const persistPhotos = photosForPersist(album);
  const inFlightImport = hasInFlightUploads(album, persistPhotos);

  return {
    ...album,
    localImportBatchPhotoIds: inFlightImport
      ? album.localImportBatchPhotoIds
      : [],
    localImportBatchTotal: inFlightImport ? album.localImportBatchTotal : 0,
    localImportBatchCounts: undefined,
    analysisBatchCounts: undefined,
    photos: includePhotos ? persistPhotos.map(toPersistablePhoto) : [],
  };
}
