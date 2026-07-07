import {deleteLocalAlbumFiles} from '@lib/localStorage';
import {clearAlbumData, culledAlbumStore, loadAlbumIntoStore} from './store';
import {CulledAlbum, hasInFlightAnalysis} from './types';

export async function purgeLocalCulledAlbum(albumId: string): Promise<void> {
  await Promise.all([
    deleteLocalAlbumFiles(albumId),
    clearAlbumData(albumId),
  ]);
}

export function shouldOpenCulledDetailScreen(
  localAlbum: CulledAlbum | null,
): boolean {
  if (!localAlbum) {
    return false;
  }

  if (hasInFlightAnalysis(localAlbum)) {
    return false;
  }

  if (localAlbum.cullingCompleted) {
    return true;
  }

  return localAlbum.photos.some(photo => photo.analysisStatus === 'analyzed');
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
