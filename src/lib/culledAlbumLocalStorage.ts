import AsyncStorage from '@react-native-async-storage/async-storage';
import {FileAsset} from '@services/upload/types';

const LOCAL_PHOTOS_KEY = '@gump/local_photos';

export type LocalPhotoRecord = {
  albumId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
};

export async function readAllPhotos(): Promise<LocalPhotoRecord[]> {
  const raw = await AsyncStorage.getItem(LOCAL_PHOTOS_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as LocalPhotoRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeAllPhotos(records: LocalPhotoRecord[]): Promise<void> {
  if (records.length === 0) {
    await AsyncStorage.removeItem(LOCAL_PHOTOS_KEY);
    return;
  }
  await AsyncStorage.setItem(LOCAL_PHOTOS_KEY, JSON.stringify(records));
}

export function toFileAsset(record: LocalPhotoRecord): FileAsset {
  return {
    uri: record.filePath,
    name: record.fileName,
    size: record.fileSize,
    type: '',
  };
}

export async function addPhoto(record: LocalPhotoRecord): Promise<void> {
  const records = await readAllPhotos();
  records.push(record);
  await writeAllPhotos(records);
}

export async function getPhotosByAlbum(
  albumId: string,
): Promise<LocalPhotoRecord[]> {
  const records = await readAllPhotos();
  return records.filter(record => record.albumId === albumId);
}

export async function removePhotosByAlbum(albumId: string): Promise<void> {
  const records = await readAllPhotos();
  await writeAllPhotos(records.filter(record => record.albumId !== albumId));
}
