import AsyncStorage from '@react-native-async-storage/async-storage';
import {listAlbumPhotos} from '@lib/localStorage';
import {FileAsset} from '@services/upload/types';

const LOCAL_PHOTOS_KEY = '@gump/local_photos';

let storageWriteQueue: Promise<void> = Promise.resolve();
function runSerializedStorageWrite<T>(operation: () => Promise<T>): Promise<T> {
  const run = storageWriteQueue.then(operation, operation);
  storageWriteQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

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
  return runSerializedStorageWrite(async () => {
    const records = await readAllPhotos();
    records.push(record);
    await writeAllPhotos(records);
  });
}

export async function getPhotosByAlbum(
  albumId: string,
): Promise<LocalPhotoRecord[]> {
  const records = await readAllPhotos();
  const albumRecords = records.filter(record => record.albumId === albumId);
  const diskFiles = await listAlbumPhotos(albumId);

  if (diskFiles.length === 0) {
    return albumRecords;
  }

  const recordsByPath = new Map(
    albumRecords.map(record => [record.filePath, record]),
  );
  const merged: LocalPhotoRecord[] = [];
  const missingFromStorage: LocalPhotoRecord[] = [];

  for (const file of diskFiles) {
    const existing = recordsByPath.get(file.uri);
    if (existing) {
      merged.push(existing);
      continue;
    }

    const record: LocalPhotoRecord = {
      albumId,
      fileName: file.name,
      filePath: file.uri,
      fileSize: file.size,
    };
    missingFromStorage.push(record);
    merged.push(record);
  }

  if (missingFromStorage.length > 0) {
    await appendPhotosIfMissing(missingFromStorage);
  }

  return merged;
}

async function appendPhotosIfMissing(
  newRecords: LocalPhotoRecord[],
): Promise<void> {
  if (newRecords.length === 0) {
    return;
  }

  return runSerializedStorageWrite(async () => {
    const records = await readAllPhotos();
    const existingPaths = new Set(records.map(record => record.filePath));
    let changed = false;

    for (const record of newRecords) {
      if (existingPaths.has(record.filePath)) {
        continue;
      }
      records.push(record);
      existingPaths.add(record.filePath);
      changed = true;
    }

    if (changed) {
      await writeAllPhotos(records);
    }
  });
}

export async function removePhotosByAlbum(albumId: string): Promise<void> {
  return runSerializedStorageWrite(async () => {
    const records = await readAllPhotos();
    await writeAllPhotos(records.filter(record => record.albumId !== albumId));
  });
}
