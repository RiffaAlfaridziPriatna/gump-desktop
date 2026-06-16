import AsyncStorage from '@react-native-async-storage/async-storage';
import {FileAsset} from '@services/upload/types';

const LOCAL_PHOTOS_KEY = '@gump/local_photos';

export type LocalPhotoRecord = {
  albumId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
};

async function readAll(): Promise<LocalPhotoRecord[]> {
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

async function writeAll(records: LocalPhotoRecord[]): Promise<void> {
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

export async function addLocalPhoto(record: LocalPhotoRecord): Promise<void> {
  const records = await readAll();
  records.push(record);
  await writeAll(records);
}

export async function getPhotosByAlbum(
  albumId: string,
): Promise<LocalPhotoRecord[]> {
  const records = await readAll();
  return records.filter(record => record.albumId === albumId);
}

export async function getPhotoCount(albumId: string): Promise<number> {
  const records = await getPhotosByAlbum(albumId);
  return records.length;
}

export async function getPhotoCounts(
  albumIds: string[],
): Promise<Record<string, number>> {
  const ids = new Set(albumIds);
  const counts = Object.fromEntries(albumIds.map(id => [id, 0]));
  const records = await readAll();
  for (const record of records) {
    if (ids.has(record.albumId)) {
      counts[record.albumId] = (counts[record.albumId] ?? 0) + 1;
    }
  }
  return counts;
}

export async function getPhotoSizeBytes(albumId: string): Promise<number> {
  const records = await getPhotosByAlbum(albumId);
  return records.reduce((sum, record) => sum + record.fileSize, 0);
}

export async function getPhotoSizeBytesByAlbum(
  albumIds: string[],
): Promise<Record<string, number>> {
  const ids = new Set(albumIds);
  const sizes = Object.fromEntries(albumIds.map(id => [id, 0]));
  const records = await readAll();
  for (const record of records) {
    if (ids.has(record.albumId)) {
      sizes[record.albumId] += record.fileSize;
    }
  }
  return sizes;
}

export function bytesToGigabytes(bytes: number): number {
  return bytes / 1024 ** 3;
}

export async function removePhotosByAlbum(albumId: string): Promise<void> {
  const records = await readAll();
  await writeAll(records.filter(record => record.albumId !== albumId));
}
