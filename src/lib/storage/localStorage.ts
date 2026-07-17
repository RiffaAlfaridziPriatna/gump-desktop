import {FileAsset} from '@services/upload/types';
import {NativeModules, Platform} from 'react-native';

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
  getImageDimensions: (
    uri: string,
  ) => Promise<{width: number; height: number}>;
  readImageCaptureTime: (uri: string) => Promise<number | null>;
  computePerceptualHash: (uri: string) => Promise<string | null>;
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
const THUMBNAIL_CACHE_VERSION = '768';

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
  if (Platform.OS !== 'windows') {
    return true;
  }
  const normalized = thumbnailUri.replace(/\\/g, '/');
  return (
    normalized.includes('/thumbs/') &&
    normalized.includes('.w2.jpg') &&
    !normalized.includes('.o1.jpg')
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

export function resolveOriginalUri(file: FileAsset): string {
  return file.uri;
}

export function resolveDetailDisplayUri(file: FileAsset): string {
  if (Platform.OS === 'windows') {
    return resolveGridDisplayUri(file) ?? file.uri;
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

