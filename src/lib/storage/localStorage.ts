import {FileAsset} from '@services/upload/types';
import {NativeDetectedFace} from '@lib/culledAlbum/types';
import {describeFileUri} from '@lib/observability/serializeError';
import {wrapError} from '@lib/observability/AppError';
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
  ) => Promise<{
    thumbnailUri: string | null;
    thumbnailWidth?: number | null;
    thumbnailHeight?: number | null;
  }>;
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
  applyLook?: (
    sourceUri: string,
    destPath: string,
    lookId: string,
    intensity: number,
    maxPixelSize: number,
    jpegQuality: number,
  ) => Promise<{uri: string | null; path?: string | null; size?: number | null}>;
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

export function isUsableThumbnailUri(
  thumbnailUri: string | null | undefined,
): thumbnailUri is string {
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

function thumbnailDimensionsFromNative(result: {
  thumbnailWidth?: number | null;
  thumbnailHeight?: number | null;
}): {thumbnailWidth?: number; thumbnailHeight?: number} {
  const width = result.thumbnailWidth ?? 0;
  const height = result.thumbnailHeight ?? 0;
  if (width <= 0 || height <= 0) {
    return {};
  }
  return {thumbnailWidth: width, thumbnailHeight: height};
}

export async function copyPhotoToAlbum(
  albumId: string,
  file: FileAsset,
  photoId: string,
): Promise<FileAsset> {
  const context = {
    operation: 'local_photo_copy',
    albumId,
    photoId,
    fileName: file.name,
    fileSize: file.size ?? null,
    nativeModuleAvailable: hasNativeLocalStorage(),
    platform: Platform.OS,
    ...describeFileUri(file.uri),
  };

  try {
    if (!hasNativeLocalStorage()) {
      throw new Error(
        'Local photo storage is not available. Build the app with GumpLocalStorage native module.',
      );
    }

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

    return {
      ...copied,
      ...thumbnailDimensionsFromNative(copied),
    };
  } catch (error) {
    throw wrapError(error, 'Local photo copy failed', context);
  }
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
      return {
        ...file,
        thumbnailUri,
        ...thumbnailDimensionsFromNative(result),
      };
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

export type ApplyLookNativeResult = {
  uri: string | null;
  path?: string | null;
  /** Byte length of the baked JPEG when the native module reports it. */
  size?: number | null;
};

/** Strip cache-busters and decode file URIs before native PathFromUri (esp. Windows). */
export function normalizeNativeFileUri(uri: string): string {
  let value = uri.trim();
  if (!value) {
    return value;
  }
  const queryIndex = value.indexOf('?');
  if (queryIndex >= 0) {
    value = value.slice(0, queryIndex);
  }
  const hashIndex = value.indexOf('#');
  if (hashIndex >= 0) {
    value = value.slice(0, hashIndex);
  }
  if (!value.toLowerCase().startsWith('file://')) {
    return value;
  }
  let pathPart = value.slice('file://'.length);
  if (/^\/[a-zA-Z]:/.test(pathPart)) {
    pathPart = pathPart.slice(1);
  }
  try {
    pathPart = decodeURIComponent(pathPart);
  } catch {
    // Keep literal path when URI encoding is malformed.
  }
  const slashPath = pathPart.replace(/\\/g, '/');
  return slashPath.match(/^[a-zA-Z]:/)
    ? `file:///${slashPath}`
    : `file://${slashPath.startsWith('/') ? '' : '/'}${slashPath}`;
}

export async function applyLookToJpeg(options: {
  sourceUri: string;
  destPath: string;
  lookId: string;
  intensity: number;
  maxPixelSize: number;
  jpegQuality: number;
}): Promise<ApplyLookNativeResult> {
  if (!hasNativeLocalStorage() || !NativeLocalStorage?.applyLook) {
    throw new Error(
      'Apply Look bake is not available. Build the app with GumpLocalStorage applyLook.',
    );
  }

  const result = await NativeLocalStorage.applyLook(
    normalizeNativeFileUri(options.sourceUri),
    options.destPath,
    options.lookId,
    options.intensity,
    options.maxPixelSize,
    options.jpegQuality,
  );

  const size =
    typeof result.size === 'number' && Number.isFinite(result.size) && result.size > 0
      ? Math.round(result.size)
      : null;

  return {
    uri: result.uri ?? null,
    path: result.path ?? null,
    size,
  };
}

/** Byte length of a local file URI (used when native bake omits size). */
export async function getLocalFileByteSize(uri: string): Promise<number> {
  const response = await fetch(normalizeNativeFileUri(uri));
  if (!response.ok) {
    throw new Error(`Failed to read baked file size (${response.status})`);
  }
  const blob = await response.blob();
  if (blob.size <= 0) {
    throw new Error('Baked look file is empty');
  }
  return blob.size;
}

