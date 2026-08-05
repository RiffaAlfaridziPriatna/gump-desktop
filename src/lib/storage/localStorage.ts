import {FileAsset} from '@services/upload/types';
import {NativeDetectedFace} from '@lib/culledAlbum/types';
import {NativeModules, Platform} from 'react-native';

export type NativeAnalyzePhotoResult = {
  faces: NativeDetectedFace[];
  perceptualHash?: string | null;
  capturedAt?: number | null;
};

type NativeLocalStorageModule = {
  copyPhoto: (
    albumId: string,
    sourceUri: string,
    fileName: string,
    photoId: string,
  ) => Promise<FileAsset>;
  listPhotos: (albumId: string) => Promise<FileAsset[]>;
  deletePhoto: (uri: string) => Promise<boolean>;
  deleteAlbum: (albumId: string) => Promise<boolean>;
  getThumbnailUri: (albumId: string, photoId: string) => Promise<string | null>;
  ensureThumbnail: (
    albumId: string,
    sourceUri: string,
    photoId: string,
  ) => Promise<{thumbnailUri: string | null}>;
  ensureDetail: (
    albumId: string,
    sourceUri: string,
    photoId: string,
  ) => Promise<{detailUri: string | null}>;
  getImageDimensions: (
    uri: string,
  ) => Promise<{width: number; height: number}>;
  readImageCaptureTime: (uri: string) => Promise<number | null>;
  computePerceptualHash: (uri: string) => Promise<string | null>;
  detectFacesForCulling?: (uri: string) => Promise<NativeDetectedFace[]>;
  analyzePhotoForCulling?: (uri: string) => Promise<NativeAnalyzePhotoResult>;
  ensureFaceCrops: (
    albumId: string,
    sourceUri: string,
    photoId: string,
    faces: Array<{
      faceIndex: number;
      boundingBox: {
        left: number;
        top: number;
        width: number;
        height: number;
      };
    }>,
  ) => Promise<{cropUris: Array<string | null>}>;
};

const NativeLocalStorage = NativeModules.GumpLocalStorage as
  | NativeLocalStorageModule
  | undefined;

const NATIVE_STORAGE_PLATFORMS = new Set(['macos', 'ios', 'android', 'windows']);
const THUMBNAIL_CACHE_VERSION = '1920-v4';

function hasNativeLocalStorage(): boolean {
  return (
    NATIVE_STORAGE_PLATFORMS.has(Platform.OS) &&
    NativeLocalStorage?.copyPhoto != null
  );
}

export function isUsableThumbnailUri(thumbnailUri: string | null | undefined): boolean {
  if (!thumbnailUri) {
    return false;
  }
  const normalized = thumbnailUri.replace(/\\/g, '/');
  return (
    normalized.includes('/thumbs/') &&
    normalized.endsWith('.v4.jpg')
  );
}

export function isUsableDetailUri(detailUri: string | null | undefined): boolean {
  if (!detailUri) {
    return false;
  }
  const normalized = detailUri.replace(/\\/g, '/').split('?')[0] ?? '';
  return (
    normalized.includes('/details/') &&
    normalized.endsWith('.d1.jpg')
  );
}

const COPY_REQUIRES_THUMBNAIL = new Set(['macos', 'windows']);

export async function copyPhotoToAlbum(
  albumId: string,
  file: FileAsset,
  photoId: string,
): Promise<FileAsset> {
  if (hasNativeLocalStorage()) {
    const copied = await NativeLocalStorage!.copyPhoto(
      albumId,
      file.uri,
      file.name,
      photoId,
    );

    if (
      COPY_REQUIRES_THUMBNAIL.has(Platform.OS) &&
      !isUsableThumbnailUri(copied.thumbnailUri)
    ) {
      throw new Error(
        'Local photo copy did not produce a usable thumbnail',
      );
    }

    return copied;
  }

  throw new Error(
    'Local photo storage is not available. Build the app with GumpLocalStorage native module.',
  );
}

export async function deleteLocalAlbumFiles(albumId: string): Promise<void> {
  if (hasNativeLocalStorage() && NativeLocalStorage?.deleteAlbum) {
    await NativeLocalStorage.deleteAlbum(albumId);
  }
}

export async function deleteLocalPhotoFile(uri: string): Promise<void> {
  if (hasNativeLocalStorage() && NativeLocalStorage?.deletePhoto) {
    await NativeLocalStorage.deletePhoto(uri);
  }
}

export async function listAlbumPhotos(albumId: string): Promise<FileAsset[]> {
  if (hasNativeLocalStorage() && NativeLocalStorage?.listPhotos) {
    return NativeLocalStorage.listPhotos(albumId);
  }
  return [];
}

export async function readImageCaptureTime(uri: string): Promise<number | null> {
  if (hasNativeLocalStorage() && NativeLocalStorage?.readImageCaptureTime) {
    return NativeLocalStorage.readImageCaptureTime(uri);
  }
  return null;
}

export async function computePerceptualHash(uri: string): Promise<string | null> {
  if (hasNativeLocalStorage() && NativeLocalStorage?.computePerceptualHash) {
    return NativeLocalStorage.computePerceptualHash(uri);
  }
  return null;
}

export async function detectFacesForCulling(
  uri: string,
): Promise<NativeDetectedFace[]> {
  if (!hasNativeLocalStorage() || !NativeLocalStorage?.detectFacesForCulling) {
    throw new Error('Native face detection is not available');
  }
  return NativeLocalStorage.detectFacesForCulling(uri);
}

export async function analyzePhotoForCulling(
  uri: string,
): Promise<NativeAnalyzePhotoResult | null> {
  if (!hasNativeLocalStorage() || !NativeLocalStorage?.analyzePhotoForCulling) {
    return null;
  }
  return NativeLocalStorage.analyzePhotoForCulling(uri);
}

export function hasNativeAnalyzePhotoForCulling(): boolean {
  return (
    hasNativeLocalStorage() && NativeLocalStorage?.analyzePhotoForCulling != null
  );
}

export function hasNativeDetectFacesForCulling(): boolean {
  return (
    hasNativeLocalStorage() && NativeLocalStorage?.detectFacesForCulling != null
  );
}

export function resolveDisplayUri(file: FileAsset): string {
  return isUsableThumbnailUri(file.thumbnailUri)
    ? file.thumbnailUri!
    : file.uri;
}

export function resolveKeyFaceDisplayUri(file: FileAsset): string {
  return isUsableThumbnailUri(file.thumbnailUri)
    ? file.thumbnailUri!
    : file.uri;
}

export function resolveGridDisplayUri(file: FileAsset): string | null {
  return isUsableThumbnailUri(file.thumbnailUri) ? file.thumbnailUri! : null;
}

// Prefer the oriented 4096 detail derivative. Fall back to the 1920 thumb, then
// the original. Never prefer the original on Windows: EXIF rotation is not
// applied by the XAML Image renderer, so portrait originals stretch sideways.
export function resolveDetailDisplayUri(file: FileAsset): string {
  if (isUsableDetailUri(file.detailUri)) {
    return file.detailUri!;
  }
  if (isUsableThumbnailUri(file.thumbnailUri)) {
    return file.thumbnailUri!;
  }
  return file.uri;
}

export async function getThumbnailUri(
  albumId: string,
  photoId: string,
): Promise<string | null> {
  if (hasNativeLocalStorage() && NativeLocalStorage?.getThumbnailUri) {
    return NativeLocalStorage.getThumbnailUri(albumId, photoId);
  }
  return null;
}

export async function ensureThumbnail(
  albumId: string,
  file: FileAsset,
  photoId: string,
  options?: {regenerate?: boolean},
): Promise<FileAsset> {
  if (isUsableThumbnailUri(file.thumbnailUri) && !options?.regenerate) {
    return file;
  }

  if (!options?.regenerate) {
    const existing = await getThumbnailUri(albumId, photoId);
    if (isUsableThumbnailUri(existing)) {
      return {...file, thumbnailUri: existing!};
    }
  }

  if (hasNativeLocalStorage() && NativeLocalStorage?.ensureThumbnail) {
    const result = await NativeLocalStorage.ensureThumbnail(
      albumId,
      file.uri,
      photoId,
    );

    if (result.thumbnailUri) {
      const thumbnailUri = options?.regenerate
        ? `${result.thumbnailUri}?v=${THUMBNAIL_CACHE_VERSION}`
        : result.thumbnailUri;
      return {...file, thumbnailUri};
    }
  }

  return file;
}

export async function ensureDetail(
  albumId: string,
  file: FileAsset,
  photoId: string,
): Promise<FileAsset> {
  if (isUsableDetailUri(file.detailUri)) {
    return file;
  }

  if (hasNativeLocalStorage() && NativeLocalStorage?.ensureDetail) {
    const result = await NativeLocalStorage.ensureDetail(
      albumId,
      file.uri,
      photoId,
    );
    if (isUsableDetailUri(result.detailUri)) {
      return {...file, detailUri: result.detailUri!};
    }
  }

  return file;
}

export type FaceCropInput = {
  faceIndex: number;
  boundingBox: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
};

export async function ensureFaceCrops(
  albumId: string,
  sourceUri: string,
  photoId: string,
  faces: FaceCropInput[],
): Promise<Array<string | null>> {
  if (
    !hasNativeLocalStorage() ||
    !NativeLocalStorage?.ensureFaceCrops ||
    faces.length === 0
  ) {
    return faces.map(() => null);
  }

  const result = await NativeLocalStorage.ensureFaceCrops(
    albumId,
    sourceUri,
    photoId,
    faces,
  );

  return result.cropUris.map(uri => uri ?? null);
}

