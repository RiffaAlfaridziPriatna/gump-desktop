import {make} from '@lib/di';
import {APIService, APIResponse} from '@services/api';
import {culledAlbumStore, persistAlbum} from './store';
import {
  CulledAlbum,
  hasInFlightAnalysis,
  hasInFlightUploads,
} from './types';

function jsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isAlbumMetadataSynced(
  local: CulledAlbum,
  server: APIResponse.Album,
): boolean {
  return (
    local.name === server.name &&
    local.title === server.title &&
    local.link === server.link &&
    jsonEqual(local.cover, server.cover) &&
    jsonEqual(local.coverMobile, server.coverMobile) &&
    local.syncedMediaCount === server.totalMediaCount &&
    local.syncedStorageGb === server.size
  );
}

function applyServerMetadata(
  local: CulledAlbum,
  server: APIResponse.Album,
): void {
  local.name = server.name;
  local.title = server.title;
  local.cover = server.cover;
  local.coverMobile = server.coverMobile;
  local.link = server.link;
  local.syncedMediaCount = server.totalMediaCount;
  local.syncedStorageGb = server.size;
}

export async function syncCulledAlbumsWithServer(
  albumIds: string[],
): Promise<void> {
  if (albumIds.length === 0) {
    return;
  }

  const api = make(APIService);
  if (!api.agent.getToken()) {
    return;
  }

  const response = await api.album.getByIds(albumIds);
  const serverAlbums = new Map(
    response.results.map(album => [album.id, album]),
  );

  const albumIdsToPersist: string[] = [];

  culledAlbumStore.setState(state => {
    for (const albumId of albumIds) {
      const serverAlbum = serverAlbums.get(albumId);
      const localAlbum = state.albums[albumId];
      if (!serverAlbum || !localAlbum) {
        continue;
      }
      if (
        hasInFlightUploads(localAlbum) ||
        hasInFlightAnalysis(localAlbum)
      ) {
        continue;
      }
      if (isAlbumMetadataSynced(localAlbum, serverAlbum)) {
        continue;
      }

      applyServerMetadata(localAlbum, serverAlbum);
      albumIdsToPersist.push(albumId);
    }
  });

  await Promise.all(albumIdsToPersist.map(albumId => persistAlbum(albumId)));
}
