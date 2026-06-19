import AsyncStorage from '@react-native-async-storage/async-storage';
import {CulledAlbum, normalizePersistedAlbum} from './types';

const CULLED_ALBUMS_KEY = '@gump/culled_albums';

let storageWriteQueue: Promise<void> = Promise.resolve();

function runSerializedStorageWrite<T>(operation: () => Promise<T>): Promise<T> {
  const run = storageWriteQueue.then(operation, operation);
  storageWriteQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function readAllAlbums(): Promise<Record<string, CulledAlbum>> {
  const raw = await AsyncStorage.getItem(CULLED_ALBUMS_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, CulledAlbum>;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    for (const [albumId, album] of Object.entries(parsed)) {
      parsed[albumId] = normalizePersistedAlbum(album);
    }
    return parsed;
  } catch {
    return {};
  }
}

export async function writeAllAlbums(
  data: Record<string, CulledAlbum>,
): Promise<void> {
  const hasData = Object.keys(data).length > 0;
  if (!hasData) {
    await AsyncStorage.removeItem(CULLED_ALBUMS_KEY);
    return;
  }
  await AsyncStorage.setItem(CULLED_ALBUMS_KEY, JSON.stringify(data));
}

export async function readAlbum(albumId: string): Promise<CulledAlbum | null> {
  const all = await readAllAlbums();
  return all[albumId] ?? null;
}

export async function saveAlbum(album: CulledAlbum): Promise<void> {
  return runSerializedStorageWrite(async () => {
    const all = await readAllAlbums();
    all[album.albumId] = album;
    await writeAllAlbums(all);
  });
}

export async function removeAlbum(albumId: string): Promise<void> {
  return runSerializedStorageWrite(async () => {
    const all = await readAllAlbums();
    delete all[albumId];
    await writeAllAlbums(all);
  });
}
