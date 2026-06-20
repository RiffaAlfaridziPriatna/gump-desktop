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
};

const NativeLocalStorage = NativeModules.GumpLocalStorage as
  | NativeLocalStorageModule
  | undefined;

export async function copyPhotoToAlbum(
  albumId: string,
  file: FileAsset,
  photoId: string,
): Promise<FileAsset> {
  if (Platform.OS === 'macos' && NativeLocalStorage?.copyPhoto) {
    return NativeLocalStorage.copyPhoto(
      albumId,
      file.uri,
      file.name,
      photoId,
    );
  }

  throw new Error(
    'Local photo storage is not available. Build the macOS app with GumpLocalStorage native module.',
  );
}

export async function deleteLocalAlbumFiles(albumId: string): Promise<void> {
  if (Platform.OS === 'macos' && NativeLocalStorage?.deleteAlbum) {
    await NativeLocalStorage.deleteAlbum(albumId);
  }
}

export async function deleteLocalPhotoFile(uri: string): Promise<void> {
  if (Platform.OS === 'macos' && NativeLocalStorage?.deletePhoto) {
    await NativeLocalStorage.deletePhoto(uri);
  }
}

export async function listAlbumPhotos(albumId: string): Promise<FileAsset[]> {
  if (Platform.OS === 'macos' && NativeLocalStorage?.listPhotos) {
    return NativeLocalStorage.listPhotos(albumId);
  }
  return [];
}
