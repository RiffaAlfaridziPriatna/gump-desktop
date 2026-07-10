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
};

const NativeLocalStorage = NativeModules.GumpLocalStorage as
  | NativeLocalStorageModule
  | undefined;

const NATIVE_STORAGE_PLATFORMS = new Set(['macos', 'ios', 'android', 'windows']);
const THUMBNAIL_CACHE_VERSION = '1920';

function hasNativeLocalStorage(): boolean {
  return (
    NATIVE_STORAGE_PLATFORMS.has(Platform.OS) &&
    NativeLocalStorage?.copyPhoto != null
  );
}

export async function copyPhotoToAlbum(
  albumId: string,
  file: FileAsset,
  photoId: string,
): Promise<FileAsset> {
  if (hasNativeLocalStorage()) {
    return NativeLocalStorage!.copyPhoto(
      albumId,
      file.uri,
      file.name,
      photoId,
    );
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
  return file.thumbnailUri ?? file.uri;
}

export function resolveGridDisplayUri(file: FileAsset): string | null {
  return file.thumbnailUri ?? null;
}

export function resolveOriginalUri(file: FileAsset): string {
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
  // If thumbnail is already set, keep it unless caller explicitly requests regeneration.
  if (file.thumbnailUri && !options?.regenerate) {
    return file;
  }

  // If we are not regenerating, try to reuse any existing thumbnail URI from native storage.
  if (!options?.regenerate) {
    const existing = await getThumbnailUri(albumId, photoId);
    if (existing) {
      return {...file, thumbnailUri: existing};
    }
  }

  if (hasNativeLocalStorage() && NativeLocalStorage?.ensureThumbnail) {
    const result = await NativeLocalStorage.ensureThumbnail(
      albumId,
      file.uri,
      photoId,
    );

    if (result.thumbnailUri) {
      // Cache-buster to avoid React Native Image caching older thumbnails.
      const thumbnailUri = options?.regenerate
        ? `${result.thumbnailUri}?v=${THUMBNAIL_CACHE_VERSION}`
        : result.thumbnailUri;
      return {...file, thumbnailUri};
    }
  }

  return file;
}

