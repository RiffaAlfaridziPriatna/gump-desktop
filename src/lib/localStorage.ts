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
