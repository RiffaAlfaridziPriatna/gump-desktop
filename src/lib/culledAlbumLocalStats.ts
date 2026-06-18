import {createStateStore} from '@lib/state';
import {
  getPhotosByAlbum,
  LocalPhotoRecord,
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

  try {
    const {counts: loadedCounts, sizeBytes: loadedSizeBytes} =
      await computeStatsFromStorage(albumIds);

    culledAlbumLocalStatsStore.setState(state => {
      state.error = null;
      for (const albumId of albumIds) {
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
  const counts = Object.fromEntries(albumIds.map(id => [id, 0]));
  const sizeBytes = Object.fromEntries(albumIds.map(id => [id, 0]));

  await Promise.all(
    albumIds.map(async albumId => {
      const photos = await getPhotosByAlbum(albumId);
      counts[albumId] = photos.length;
      sizeBytes[albumId] = photos.reduce(
        (total, photo) => total + photo.fileSize,
        0,
      );
    }),
  );

  return {counts, sizeBytes};
}
