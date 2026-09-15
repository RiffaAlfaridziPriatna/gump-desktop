import {APIResponse} from '@services/api';

/** Rows of selectable cards needed before scroll pagination can reliably engage. */
export const SELECT_ALBUM_PREFETCH_MIN_ROWS = 3;

/**
 * Minimum selectable (empty, non-local) albums to warm before Select Album
 * leaves the loading state. `columns * minRows + 1` fills minRows and starts
 * the next row so content is tall enough to scroll.
 */
export function getSelectAlbumPrefetchThreshold(columns: number): number {
  return Math.max(1, columns) * SELECT_ALBUM_PREFETCH_MIN_ROWS + 1;
}

export function filterAvailableSourceAlbums(
  siteAlbums: APIResponse.Album[],
  localAlbumIds: ReadonlySet<string>,
): APIResponse.Album[] {
  return siteAlbums.filter(
    album => album.totalMediaCount === 0 && !localAlbumIds.has(album.id),
  );
}

export function countAvailableSourceAlbums(
  siteAlbums: APIResponse.Album[],
  localAlbumIds: ReadonlySet<string>,
): number {
  return filterAvailableSourceAlbums(siteAlbums, localAlbumIds).length;
}
