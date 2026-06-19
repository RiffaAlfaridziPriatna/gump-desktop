import {APIResponse} from '@services/api';
import {FileAsset} from '@services/upload/types';

export type NativeDetectedFace = {
  boundingBox: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  eyesOpen?: {
    value: boolean;
    confidence: number;
  };
  sharpness: number;
  brightness: number;
  landmarks: Array<{type: string; x: number; y: number}>;
  pose: {pitch: number; roll: number; yaw: number};
  faceId: string;
};

export type CulledAlbumPhotoUploadStatus =
  | 'pending'
  | 'uploading'
  | 'uploaded'
  | 'failed';

export type CulledAlbumPhotoServerUploadStatus =
  | 'idle'
  | 'pending'
  | 'uploading'
  | 'uploaded'
  | 'failed';

export type CulledAlbumPhotoAnalysisStatus =
  | 'idle'
  | 'pending'
  | 'analyzing'
  | 'analyzed'
  | 'failed';

export type CulledAlbumPhoto = {
  photoId: string;
  file: FileAsset;
  progress: number;
  status: CulledAlbumPhotoUploadStatus;
  error?: string;
  serverUploadStatus: CulledAlbumPhotoServerUploadStatus;
  serverUploadError?: string;
  simulatedMinDurationMs?: number;
  analysisProgress: number;
  analysisStatus: CulledAlbumPhotoAnalysisStatus;
  analysisError?: string;
  faces: APIResponse.CullingFace[];
  selected: boolean;
  starRating: number | null;
  aiSelected: boolean;
  maybe: boolean;
  blurred: boolean;
  closedEyes: boolean;
  duplicated: boolean;
};

export type CulledAlbumSource = Pick<
  APIResponse.Album,
  'id' | 'name' | 'title' | 'cover' | 'coverMobile'
>;

export type CulledAlbum = {
  albumId: string;
  name: string;
  title: string | null;
  cover: APIResponse.AlbumCover;
  coverMobile: APIResponse.AlbumCover;
  cullingCompleted: boolean;
  cullingHasUploads: boolean;
  uploadBatchPhotoIds: string[];
  createdAt: string;
  totalPhotos: number;
  totalStorage: number;
  photos: CulledAlbumPhoto[];
};

export function createCulledAlbumPhoto(
  file: FileAsset,
  photoId: string,
): CulledAlbumPhoto {
  return {
    photoId,
    file,
    progress: 0,
    status: 'pending',
    serverUploadStatus: 'idle',
    analysisProgress: 0,
    analysisStatus: 'idle',
    faces: [],
    selected: false,
    starRating: null,
    aiSelected: false,
    maybe: false,
    blurred: false,
    closedEyes: false,
    duplicated: false,
  };
}

export function createCulledAlbumFromSelection(
  source: CulledAlbumSource,
): CulledAlbum {
  return {
    albumId: source.id,
    name: source.name,
    title: source.title,
    cover: source.cover,
    coverMobile: source.coverMobile,
    cullingCompleted: false,
    cullingHasUploads: false,
    uploadBatchPhotoIds: [],
    createdAt: new Date().toISOString(),
    totalPhotos: 0,
    totalStorage: 0,
    photos: [],
  };
}

export function recomputeAlbumTotals(album: CulledAlbum): CulledAlbum {
  album.totalPhotos = album.photos.length;
  album.totalStorage = album.photos.reduce(
    (total, photo) => total + (photo.file.size ?? 0),
    0,
  );
  return album;
}

export function isUploadInFlight(photo: CulledAlbumPhoto): boolean {
  return photo.status === 'pending' || photo.status === 'uploading';
}

export function isAnalysisInFlight(photo: CulledAlbumPhoto): boolean {
  return (
    photo.analysisStatus === 'pending' || photo.analysisStatus === 'analyzing'
  );
}

export function hasInFlightUploads(
  album: CulledAlbum | null | undefined,
): boolean {
  return album?.photos.some(isUploadInFlight) ?? false;
}

export function hasInFlightAnalysis(
  album: CulledAlbum | null | undefined,
): boolean {
  return album?.photos.some(isAnalysisInFlight) ?? false;
}

export function countByUploadStatus(
  photos: CulledAlbumPhoto[],
  status: CulledAlbumPhotoUploadStatus,
): number {
  return photos.filter(photo => photo.status === status).length;
}

export function countByAnalysisStatus(
  photos: CulledAlbumPhoto[],
  status: CulledAlbumPhotoAnalysisStatus,
): number {
  return photos.filter(photo => photo.analysisStatus === status).length;
}

export function isServerUploadBatchComplete(
  album: CulledAlbum | null | undefined,
): boolean {
  if (!album?.uploadBatchPhotoIds.length) {
    return false;
  }

  return album.uploadBatchPhotoIds.every(photoId => {
    const photo = album.photos.find(entry => entry.photoId === photoId);
    return photo?.serverUploadStatus === 'uploaded';
  });
}

export function hasStartedCulling(album: CulledAlbum | null | undefined): boolean {
  if (!album) {
    return false;
  }
  if (album.cullingCompleted) {
    return true;
  }
  return album.photos.some(photo => photo.analysisStatus !== 'idle');
}

export function toCullingPhoto(photo: CulledAlbumPhoto): APIResponse.CullingPhoto {
  return {
    photoId: photo.photoId,
    fileName: photo.file.name,
    faces: photo.faces,
    selected: photo.selected,
    aiSelected: photo.aiSelected,
    maybe: photo.maybe,
    blurred: photo.blurred,
    closedEyes: photo.closedEyes,
    duplicated: photo.duplicated,
    starRating: photo.starRating,
  };
}

export function normalizePersistedPhoto(
  photo: CulledAlbumPhoto,
): CulledAlbumPhoto {
  if (photo.status === 'uploading') {
    photo.status = 'pending';
    photo.progress = 0;
  }
  if (photo.analysisStatus === 'analyzing' || photo.analysisStatus === 'pending') {
    photo.analysisStatus = photo.faces.length > 0 ? 'analyzed' : 'idle';
    photo.analysisProgress = photo.faces.length > 0 ? 100 : 0;
  }
  photo.serverUploadStatus ??= 'idle';
  return photo;
}

export function normalizePersistedAlbum(album: CulledAlbum): CulledAlbum {
  album.name ??= 'Untitled';
  album.title ??= null;
  album.cover ??= null;
  album.coverMobile ??= null;
  album.cullingCompleted ??= false;
  album.cullingHasUploads ??= false;
  album.uploadBatchPhotoIds ??= [];
  album.createdAt ??= new Date(0).toISOString();
  album.totalPhotos ??= album.photos.length;
  album.totalStorage ??= 0;
  album.photos = (album.photos ?? []).map(normalizePersistedPhoto);
  recomputeAlbumTotals(album);
  return album;
}
