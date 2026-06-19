import {APIResponse} from '@services/api';

export function filterAvailableSourceAlbums(
  siteAlbums: APIResponse.Album[],
  localAlbumIds: ReadonlySet<string>,
): APIResponse.Album[] {
  return siteAlbums.filter(
    album => album.totalMediaCount === 0 && !localAlbumIds.has(album.id),
  );
}
