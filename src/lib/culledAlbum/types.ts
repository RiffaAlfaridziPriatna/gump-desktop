import {derivePhotoFlags} from '@lib/culling/cullingUtil';
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

export type LocalImportBatchCounts = {
  total: number;
  pending: number;
  uploading: number;
  uploaded: number;
  failed: number;
};

export type LocalImportCountKey = keyof Omit<
  LocalImportBatchCounts,
  'total'
>;

export type AnalysisBatchCounts = {
  total: number;
  pending: number;
  analyzing: number;
  analyzed: number;
  failed: number;
};

export type AnalysisCountKey = keyof Omit<AnalysisBatchCounts, 'total'>;

export type CulledAlbumPhoto = {
  photoId: string;
  file: FileAsset;
  /** Unix timestamp (ms) when the photo was added locally; used for display order. */
  uploadedAt: number;
  /** Unix timestamp (ms) from EXIF/picker capture metadata when available. */
  capturedAt: number | null;
  /** 64-bit difference hash (dHash) as 16-char hex for duplicate detection. */
  perceptualHash: string | null;
  progress: number;
  status: CulledAlbumPhotoUploadStatus;
  error?: string;
  serverUploadStatus: CulledAlbumPhotoServerUploadStatus;
  serverUploadProgress: number;
  serverUploadError?: string;
  simulatedMinDurationMs?: number;
  analysisProgress: number;
  analysisStatus: CulledAlbumPhotoAnalysisStatus;
  analysisError?: string;
  /** Native detector pipeline version used for the latest successful analysis. */
  analysisEngineVersion?: string | null;
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
  'id' | 'name' | 'title' | 'cover' | 'coverMobile' | 'link'
>;

export type CulledAlbum = {
  albumId: string;
  name: string;
  title: string | null;
  cover: APIResponse.AlbumCover;
  coverMobile: APIResponse.AlbumCover;
  cullingCompleted: boolean;
  cullingHasUploads: boolean;
  link: string;
  uploadBatchPhotoIds: string[];
  localImportBatchPhotoIds: string[];
  localImportBatchTotal: number;
  localImportBatchCounts?: LocalImportBatchCounts;
  analysisBatchPhotoIds: string[];
  analysisBatchCounts?: AnalysisBatchCounts;
  nextFaceClusterId: number;
  createdAt: string;
  totalPhotos: number;
  totalStorage: number;
  syncedMediaCount?: number;
  syncedStorageGb?: number;
  cullingStats?: APIResponse.CullingStats;
  cullingKeyFaces?: APIResponse.CullingKeyFace[];
  photos: CulledAlbumPhoto[];
};

export type CulledAlbumListItem = Pick<
  CulledAlbum,
  | 'albumId'
  | 'name'
  | 'title'
  | 'cover'
  | 'coverMobile'
  | 'cullingCompleted'
  | 'cullingHasUploads'
  | 'link'
  | 'createdAt'
  | 'totalPhotos'
  | 'totalStorage'
  | 'syncedMediaCount'
  | 'syncedStorageGb'
>;

export function createCulledAlbumPhoto(
  file: FileAsset,
  photoId: string,
  uploadedAt: number = Date.now(),
): CulledAlbumPhoto {
  return {
    photoId,
    file,
    uploadedAt,
    capturedAt: file.capturedAt ?? null,
    perceptualHash: null,
    progress: 0,
    status: 'pending',
    serverUploadStatus: 'idle',
    serverUploadProgress: 0,
    analysisProgress: 0,
    analysisStatus: 'idle',
    analysisEngineVersion: null,
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
    link: source.link,
    uploadBatchPhotoIds: [],
    localImportBatchPhotoIds: [],
    localImportBatchTotal: 0,
    localImportBatchCounts: undefined,
    analysisBatchPhotoIds: [],
    analysisBatchCounts: undefined,
    nextFaceClusterId: 0,
    createdAt: new Date().toISOString(),
    totalPhotos: 0,
    totalStorage: 0,
    cullingStats: undefined,
    cullingKeyFaces: undefined,
    photos: [],
  };
}

export function comparePhotosByUploadedAtDesc(
  a: CulledAlbumPhoto,
  b: CulledAlbumPhoto,
): number {
  return (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0);
}

export function sortPhotosByUploadedAt(
  photos: CulledAlbumPhoto[],
): CulledAlbumPhoto[] {
  return [...photos].sort(comparePhotosByUploadedAtDesc);
}

export function comparePhotosByFilename(
  a: CulledAlbumPhoto,
  b: CulledAlbumPhoto,
): number {
  return a.file.name.localeCompare(b.file.name, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

export function sortPhotosByFilename(
  photos: CulledAlbumPhoto[],
): CulledAlbumPhoto[] {
  return [...photos].sort(comparePhotosByFilename);
}

export function recomputeAlbumTotals(album: CulledAlbum): CulledAlbum {
  album.totalPhotos = album.photos.length;
  album.totalStorage = album.photos.reduce(
    (total, photo) => total + (photo.file.size ?? 0),
    0,
  );
  return album;
}

export function isCulledPhotoDisabled(
  photo: CulledAlbumPhoto,
  cullingHasUploads: boolean,
): boolean {
  if (!cullingHasUploads) {
    return false;
  }
  return photo.serverUploadStatus === 'uploaded';
}

export function isUploadInFlight(photo: CulledAlbumPhoto): boolean {
  return photo.status === 'pending' || photo.status === 'uploading';
}

export function isAnalysisInFlight(photo: CulledAlbumPhoto): boolean {
  return (
    photo.analysisStatus === 'pending' || photo.analysisStatus === 'analyzing'
  );
}

export function isServerUploadInFlight(photo: CulledAlbumPhoto): boolean {
  return (
    photo.serverUploadStatus === 'pending' ||
    photo.serverUploadStatus === 'uploading'
  );
}

export function hasInFlightUploads(
  album: CulledAlbum | null | undefined,
  photos?: CulledAlbumPhoto[],
): boolean {
  if (!album) {
    return false;
  }

  if (album.localImportBatchPhotoIds.length > 0) {
    const counts = album.localImportBatchCounts;
    if (counts) {
      return counts.pending > 0 || counts.uploading > 0;
    }

    const source = photos ?? album.photos;
    const photosById = new Map(source.map(photo => [photo.photoId, photo]));
    for (const photoId of album.localImportBatchPhotoIds) {
      const photo = photosById.get(photoId);
      if (!photo || isUploadInFlight(photo)) {
        return true;
      }
    }
    return false;
  }

  const source = photos ?? album.photos;
  return source.some(isUploadInFlight);
}

export function hasInFlightAnalysis(
  album: CulledAlbum | null | undefined,
  photos?: CulledAlbumPhoto[],
): boolean {
  if (!album || album.analysisBatchPhotoIds.length === 0) {
    return false;
  }

  const counts = album.analysisBatchCounts;
  if (counts) {
    return counts.pending > 0 || counts.analyzing > 0;
  }

  const source = photos ?? album.photos;
  const batchIds = new Set(album.analysisBatchPhotoIds);
  return source.some(
    photo => batchIds.has(photo.photoId) && isAnalysisInFlight(photo),
  );
}

export function hasInFlightServerUploads(
  album: CulledAlbum | null | undefined,
  photos?: CulledAlbumPhoto[],
): boolean {
  if (!album || album.uploadBatchPhotoIds.length === 0) {
    return false;
  }

  const batchIds = new Set(album.uploadBatchPhotoIds);
  const source = photos ?? album.photos;
  return source.some(
    photo =>
      batchIds.has(photo.photoId) &&
      photo.serverUploadStatus !== 'uploaded' &&
      photo.serverUploadStatus !== 'failed',
  );
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
  photo.uploadedAt ??= 0;
  photo.capturedAt ??= null;
  photo.perceptualHash ??= null;
  if (photo.status === 'uploading') {
    photo.status = 'pending';
    photo.progress = 0;
  }
  if (photo.analysisStatus === 'analyzing' || photo.analysisStatus === 'pending') {
    photo.analysisStatus = photo.faces.length > 0 ? 'analyzed' : 'idle';
    photo.analysisProgress = photo.faces.length > 0 ? 100 : 0;
  }
  photo.serverUploadStatus ??= 'idle';
  photo.serverUploadProgress ??= 0;
  if (photo.serverUploadStatus === 'uploading') {
    photo.serverUploadStatus = 'pending';
    photo.serverUploadProgress = 0;
  }
  if (photo.analysisStatus === 'analyzed') {
    const flags = derivePhotoFlags(photo.faces);
    photo.aiSelected = flags.aiSelected;
    photo.maybe = flags.maybe;
    photo.blurred = flags.blurred;
    photo.closedEyes = flags.closedEyes;
  }
  return photo;
}

export function normalizePersistedAlbum(album: CulledAlbum): CulledAlbum {
  album.name ??= 'Untitled';
  album.title ??= null;
  album.cover ??= null;
  album.coverMobile ??= null;
  album.cullingCompleted ??= false;
  album.cullingHasUploads ??= false;
  album.link ??= '';
  album.uploadBatchPhotoIds ??= [];
  album.localImportBatchPhotoIds ??= [];
  album.localImportBatchTotal ??= 0;
  album.localImportBatchCounts = undefined;
  album.analysisBatchPhotoIds ??= [];
  album.analysisBatchCounts = undefined;
  album.cullingStats ??= undefined;
  album.cullingKeyFaces ??= undefined;
  album.createdAt ??= new Date(0).toISOString();
  album.totalPhotos ??= album.photos.length;
  album.totalStorage ??= 0;
  album.photos = sortPhotosByFilename(
    (album.photos ?? []).map(normalizePersistedPhoto),
  );
  if (album.photos.length > 0) {
    recomputeAlbumTotals(album);
  }
  return album;
}
