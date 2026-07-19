import {CulledPhoto} from '@/domain/entities/CulledPhoto';
import {Face} from '@/domain/valueObjects/Face';
import {CulledAlbumPhoto} from './types';

export function legacyPhotoToDomain(
  photo: CulledAlbumPhoto,
  albumId: string,
): CulledPhoto {
  return CulledPhoto.fromPlain(albumId, {
    photoId: photo.photoId,
    file: photo.file,
    uploadedAt: photo.uploadedAt,
    capturedAt: photo.capturedAt,
    perceptualHash: photo.perceptualHash,
    progress: photo.progress,
    status: photo.status,
    error: photo.error,
    analysisProgress: photo.analysisProgress,
    analysisStatus: photo.analysisStatus,
    analysisError: photo.analysisError,
    analysisEngineVersion: photo.analysisEngineVersion,
    faces: photo.faces.map((face, index) =>
      Face.fromPlain({
        ...face,
        faceId: face.rekognitionFaceId ?? `${photo.photoId}-${index}`,
      }),
    ),
    serverUploadStatus: photo.serverUploadStatus,
    serverUploadProgress: photo.serverUploadProgress,
    serverUploadError: photo.serverUploadError,
    selected: photo.selected,
    starRating: photo.starRating,
    aiSelected: photo.aiSelected,
    maybe: photo.maybe,
    blurred: photo.blurred,
    closedEyes: photo.closedEyes,
    duplicated: photo.duplicated,
  });
}

export function domainPhotoToLegacy(photo: CulledPhoto): CulledAlbumPhoto {
  const file = photo.file.toPlain();
  return {
    photoId: photo.photoId,
    file: {
      ...file,
      thumbnailUri: file.thumbnailUri ?? undefined,
    },
    uploadedAt: photo.uploadedAt,
    capturedAt: photo.capturedAt,
    perceptualHash: photo.perceptualHash,
    progress: photo.progress,
    status: photo.status,
    error: photo.error ?? undefined,
    serverUploadStatus: photo.serverUploadStatus,
    serverUploadProgress: photo.serverUploadProgress,
    serverUploadError: photo.serverUploadError ?? undefined,
    analysisProgress: photo.analysisProgress,
    analysisStatus: photo.analysisStatus,
    analysisError: photo.analysisError ?? undefined,
    analysisEngineVersion: photo.analysisEngineVersion ?? null,
    faces: photo.faces.map(face => face.toPlain()),
    selected: photo.selected,
    starRating: photo.starRating,
    aiSelected: photo.aiSelected,
    maybe: photo.maybe,
    blurred: photo.blurred,
    closedEyes: photo.closedEyes,
    duplicated: photo.duplicated,
  };
}
