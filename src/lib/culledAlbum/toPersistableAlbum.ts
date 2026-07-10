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

export function toPersistableAlbum(album: CulledAlbum): CulledAlbum {
  const inFlightImport = hasInFlightUploads(album);

  return {
    ...album,
    localImportBatchPhotoIds: inFlightImport
      ? album.localImportBatchPhotoIds
      : [],
    localImportBatchTotal: inFlightImport ? album.localImportBatchTotal : 0,
    localImportBatchCounts: undefined,
    analysisBatchCounts: undefined,
    photos: album.photos.map(toPersistablePhoto),
  };
}
