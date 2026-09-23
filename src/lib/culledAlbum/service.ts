import {clearFaceClusterIndex} from '@lib/culling/faceClusterIndex';
import {deleteLocalAlbumFiles} from '@lib/storage/localStorage';
import {resetLocalAlbumAccessSession} from './localAlbumAccess';
import {getPhotosSnapshot, photoStateStore} from './photoStateStore';
import {gumpPerfMark} from './perfDebug';
import {readAllAlbumMeta} from './storage';
import {clearAlbumData, culledAlbumStore, loadAlbumIntoStore} from './store';
import {clearAllUploadQueues, clearAlbumQueues} from './uploadQueueStore';
import {CulledAlbum, hasInFlightAnalysis} from './types';

export async function purgeLocalCulledAlbum(albumId: string): Promise<void> {
  await clearAlbumData(albumId);
  void deleteLocalAlbumFiles(albumId).catch(error => {
    console.error('[purgeLocalCulledAlbum] Failed to delete album files', error);
  });
}

/**
 * Drop in-memory culled album state and queues without deleting SQLite or files.
 * Used on logout so another account does not see the previous session in UI,
 * while local album data remains available after the same user logs back in.
 */
export function unloadAllLocalCulledAlbumsFromMemory(): void {
  const albumIds = Object.keys(culledAlbumStore.getState().albums);

  for (const albumId of albumIds) {
    clearFaceClusterIndex(albumId);
    clearAlbumQueues(albumId);
  }

  clearAllUploadQueues();
  resetLocalAlbumAccessSession();
  culledAlbumStore.setState(state => {
    state.albums = {};
    state.error = null;
  });
  photoStateStore.setState(() => ({
    photoState: {},
    photoOrder: {},
    gridRevision: {},
  }));
}

/**
 * Remove every local culled album from SQLite, memory, queues, and files.
 * Prefer {@link unloadAllLocalCulledAlbumsFromMemory} on logout; use this only
 * when intentionally wiping device-local culled data.
 */
export async function purgeAllLocalCulledAlbums(): Promise<void> {
  const fromStore = Object.keys(culledAlbumStore.getState().albums);
  const persisted = await readAllAlbumMeta();
  const albumIds = new Set([...fromStore, ...Object.keys(persisted)]);

  for (const albumId of albumIds) {
    await purgeLocalCulledAlbum(albumId);
    clearAlbumQueues(albumId);
  }

  clearAllUploadQueues();
  resetLocalAlbumAccessSession();
  culledAlbumStore.setState(state => {
    state.albums = {};
    state.error = null;
  });
  photoStateStore.setState(() => ({
    photoState: {},
    photoOrder: {},
    gridRevision: {},
  }));
}

export function shouldOpenCulledDetailScreen(
  localAlbum: CulledAlbum | null,
): boolean {
  if (!localAlbum) {
    return false;
  }

  const photos = getPhotosSnapshot(localAlbum.albumId);
  const order = photoStateStore.getState().photoOrder[localAlbum.albumId];
  gumpPerfMark('shouldOpenCulledDetailScreen', {
    albumId: localAlbum.albumId,
    snapshot: photos.length,
    albumPhotos: localAlbum.photos.length,
    order: order?.length ?? 0,
    cullingCompleted: localAlbum.cullingCompleted,
  });
  if (hasInFlightAnalysis(localAlbum, photos)) {
    return false;
  }

  if (localAlbum.cullingCompleted) {
    return true;
  }

  return photos.some(photo => photo.analysisStatus === 'analyzed');
}

export function resolveCulledAlbumRouteFromMemory(
  albumId: string,
): 'AlbumDetail' | 'CulledAlbumDetail' | null {
  const localAlbum = culledAlbumStore.getState().albums[albumId] ?? null;
  if (!localAlbum) {
    return null;
  }

  return shouldOpenCulledDetailScreen(localAlbum)
    ? 'CulledAlbumDetail'
    : 'AlbumDetail';
}

export async function resolveCulledAlbumRoute(
  albumId: string,
): Promise<'AlbumDetail' | 'CulledAlbumDetail'> {
  const localAlbum = await loadAlbumIntoStore(albumId);
  return shouldOpenCulledDetailScreen(localAlbum)
    ? 'CulledAlbumDetail'
    : 'AlbumDetail';
}
