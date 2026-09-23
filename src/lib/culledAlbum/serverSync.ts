import {make} from '@di/tsyringe';
import {APIService, APIResponse} from '@services/api';
import {
  getSessionAccessibleLocalAlbumIds,
  replaceSessionAccessibleLocalAlbumIds,
} from './localAlbumAccess';
import {culledAlbumStore, persistAlbum} from './store';
import {getPhotosSnapshot} from './photoStateStore';
import {
  CulledAlbum,
  hasInFlightAnalysis,
  hasInFlightUploads,
} from './types';
import {useQuery} from '@tanstack/react-query';

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

/**
 * Returns the subset of local album ids the current auth session can access.
 * Uses GET /albums?ids=... so we do not need to page the full album catalog.
 */
export async function resolveAccessibleLocalAlbumIds(
  albumIds: string[],
): Promise<Set<string>> {
  if (albumIds.length === 0) {
    replaceSessionAccessibleLocalAlbumIds([]);
    return new Set();
  }

  const api = make(APIService);
  if (!api.agent.getToken()) {
    return new Set();
  }

  const response = await api.album.getByIds(albumIds);
  const accessibleIds = new Set(response.results.map(album => album.id));
  const localIdSet = new Set(albumIds);

  for (const albumId of getSessionAccessibleLocalAlbumIds()) {
    if (localIdSet.has(albumId)) {
      accessibleIds.add(albumId);
    }
  }

  replaceSessionAccessibleLocalAlbumIds(accessibleIds);
  return accessibleIds;
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
      const livePhotos = getPhotosSnapshot(albumId);
      if (
        hasInFlightUploads(localAlbum, livePhotos) ||
        hasInFlightAnalysis(localAlbum, livePhotos)
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

export function useServerAlbumSync(albumIds: string[], enabled: boolean = true) {
  const api = make(APIService);

  const query = useQuery({
    queryKey: ['serverAlbumSync', albumIds.sort().join(',')],
    queryFn: async () => {
      if (albumIds.length === 0 || !api.agent.getToken()) {
        return null;
      }
      await syncCulledAlbumsWithServer(albumIds);
      return true;
    },
    enabled: enabled && albumIds.length > 0,
    staleTime: 300000,
    retry: 1,
  });

  return query;
}
