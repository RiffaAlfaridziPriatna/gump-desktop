import {deleteLocalAlbumFiles} from '@lib/localStorage';
import {clearAlbumData, loadAlbumIntoStore} from './store';
import {CulledAlbum, hasStartedCulling} from './types';

export async function purgeLocalCulledAlbum(albumId: string): Promise<void> {
  await Promise.all([
    deleteLocalAlbumFiles(albumId),
    clearAlbumData(albumId),
  ]);
}

export function shouldOpenCulledDetailScreen(
  localAlbum: CulledAlbum | null,
): boolean {
  return hasStartedCulling(localAlbum);
}

export async function resolveCulledAlbumRoute(
  albumId: string,
): Promise<'AlbumDetail' | 'CulledAlbumDetail'> {
  const localAlbum = await loadAlbumIntoStore(albumId);
  return shouldOpenCulledDetailScreen(localAlbum)
    ? 'CulledAlbumDetail'
    : 'AlbumDetail';
}
