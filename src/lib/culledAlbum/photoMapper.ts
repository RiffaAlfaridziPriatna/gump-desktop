import {CulledPhoto} from '@/domain/entities/CulledPhoto';
import {Face} from '@/domain/valueObjects/Face';
import {isLookId} from '@lib/look/types';
import {CulledAlbumPhoto} from './types';
import {UPLOAD_FAILURE_GROUP, type UploadFailureCause} from './uploadPreflight';

function toUploadFailureCause(
  raw: string | null,
): UploadFailureCause | undefined {
  return (Object.keys(UPLOAD_FAILURE_GROUP) as UploadFailureCause[]).find(
    cause => cause === raw,
  );
}

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
    serverUploadCause: photo.serverUploadCause,
    selected: photo.selected,
    starRating: photo.starRating,
    lookId: photo.lookId,
    aiSelected: photo.aiSelected,
    maybe: photo.maybe,
    blurred: photo.blurred,
    closedEyes: photo.closedEyes,
    duplicated: photo.duplicated,
    batchId: photo.batchId,
  });
}

export function domainPhotoToLegacy(photo: CulledPhoto): CulledAlbumPhoto {
  const file = photo.file.toPlain();
  return {
    photoId: photo.photoId,
    file: {
      ...file,
      thumbnailUri: file.thumbnailUri ?? undefined,
      thumbnailWidth: file.thumbnailWidth ?? undefined,
      thumbnailHeight: file.thumbnailHeight ?? undefined,
      detailUri: file.detailUri ?? undefined,
      lookDetailUri: file.lookDetailUri ?? undefined,
      lookDetailKey: file.lookDetailKey ?? undefined,
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
    serverUploadCause: toUploadFailureCause(photo.serverUploadCause),
    analysisProgress: photo.analysisProgress,
    analysisStatus: photo.analysisStatus,
    analysisError: photo.analysisError ?? undefined,
    analysisEngineVersion: photo.analysisEngineVersion ?? null,
    faces: photo.faces.map(face => face.toPlain()),
    selected: photo.selected,
    starRating: photo.starRating,
    lookId: isLookId(photo.lookId) ? photo.lookId : 'original',
    aiSelected: photo.aiSelected,
    maybe: photo.maybe,
    blurred: photo.blurred,
    closedEyes: photo.closedEyes,
    duplicated: photo.duplicated,
    batchId: photo.batchId,
  };
}
