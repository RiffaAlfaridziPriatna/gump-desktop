import {deleteLocalAlbumFiles} from '@lib/storage/localStorage';
import {getPhotosSnapshot, photoStateStore} from './photoStateStore';
import {gumpPerfMark} from './perfDebug';
import {clearAlbumData, culledAlbumStore, loadAlbumIntoStore} from './store';
import {CulledAlbum, hasInFlightAnalysis} from './types';

export async function purgeLocalCulledAlbum(albumId: string): Promise<void> {
  await clearAlbumData(albumId);
  void deleteLocalAlbumFiles(albumId).catch(error => {
    console.error('[purgeLocalCulledAlbum] Failed to delete album files', error);
  });
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
