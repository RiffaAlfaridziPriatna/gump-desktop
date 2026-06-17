import {listAlbumPhotos} from '@lib/localStorage';
import {createStateStore} from '@lib/state';
import {FileAsset} from '@services/upload/types';
import {
  LocalPhotoRecord,
  readAllPhotos,
} from './culledAlbumLocalStorage';

export type CulledAlbumLocalStatsState = {
  counts: Record<string, number>;
  sizeBytes: Record<string, number>;
  error: string | null;
};

export const culledAlbumLocalStatsStore =
  createStateStore<CulledAlbumLocalStatsState>({
    counts: {},
    sizeBytes: {},
    error: null,
  });

export function recordPhotoAdded(record: LocalPhotoRecord): void {
  culledAlbumLocalStatsStore.setState(state => {
    state.counts[record.albumId] = (state.counts[record.albumId] ?? 0) + 1;
    state.sizeBytes[record.albumId] =
      (state.sizeBytes[record.albumId] ?? 0) + record.fileSize;
  });
}

export function recordPhotosRemoved(albumId: string): void {
  culledAlbumLocalStatsStore.setState(state => {
    delete state.counts[albumId];
    delete state.sizeBytes[albumId];
  });
}

export async function loadStatsForAlbums(albumIds: string[]): Promise<void> {
  if (albumIds.length === 0) {
    return;
  }

  const {counts} = culledAlbumLocalStatsStore.getState();
  const missingAlbumIds = albumIds.filter(id => counts[id] === undefined);
  if (missingAlbumIds.length === 0) {
    return;
  }

  try {
    const {counts: loadedCounts, sizeBytes: loadedSizeBytes} =
      await computeStatsFromStorage(missingAlbumIds);

    culledAlbumLocalStatsStore.setState(state => {
      state.error = null;
      for (const albumId of missingAlbumIds) {
        state.counts[albumId] = loadedCounts[albumId] ?? 0;
        state.sizeBytes[albumId] = loadedSizeBytes[albumId] ?? 0;
      }
    });
  } catch (err) {
    culledAlbumLocalStatsStore.setState({
      error:
        err instanceof Error ? err.message : 'Failed to load local album stats',
    });
  }
}

export function toSizesGb(
  sizeBytes: Record<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(sizeBytes).map(([id, bytes]) => [id, bytesToGigabytes(bytes)]),
  );
}

export function bytesToGigabytes(bytes: number): number {
  return bytes / 1024 ** 3;
}

export function formatStorageSizeGb(gb: number): string {
  if (gb <= 0) {
    return '0.0 GB';
  }
  if (gb < 1) {
    const mb = gb * 1024;
    return mb >= 100 ? `${gb.toFixed(2)} GB` : `${Math.round(mb)} MB`;
  }
  return `${gb.toFixed(1)} GB`;
}

async function computeStatsFromStorage(albumIds: string[]): Promise<{
  counts: Record<string, number>;
  sizeBytes: Record<string, number>;
}> {
  const ids = new Set(albumIds);
  const counts = Object.fromEntries(albumIds.map(id => [id, 0]));
  const sizeBytes = Object.fromEntries(albumIds.map(id => [id, 0]));
  const records = await readAllPhotos();
  const albumsNeedingDiskLookup = new Set<string>();

  for (const record of records) {
    if (!ids.has(record.albumId)) {
      continue;
    }
    counts[record.albumId] = (counts[record.albumId] ?? 0) + 1;
    if (record.fileSize > 0) {
      sizeBytes[record.albumId] += record.fileSize;
    } else {
      albumsNeedingDiskLookup.add(record.albumId);
    }
  }

  if (albumsNeedingDiskLookup.size === 0) {
    return {counts, sizeBytes};
  }

  const diskSizesByAlbum = Object.fromEntries(
    await Promise.all(
      [...albumsNeedingDiskLookup].map(async albumId => [
        albumId,
        await getDiskSizeByFileName(albumId),
      ]),
    ),
  );

  for (const record of records) {
    if (!ids.has(record.albumId) || record.fileSize > 0) {
      continue;
    }
    sizeBytes[record.albumId] +=
      diskSizesByAlbum[record.albumId]?.[record.fileName] ?? 0;
  }

  return {counts, sizeBytes};
}

async function getDiskSizeByFileName(
  albumId: string,
): Promise<Record<string, number>> {
  const files = await listAlbumPhotos(albumId);
  return Object.fromEntries(files.map((file: FileAsset) => [file.name, file.size]));
}
