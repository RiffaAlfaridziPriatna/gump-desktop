import {APIResponse} from '@services/api';
import {CulledAlbum} from './types';

export function bytesToGigabytes(bytes: number): number {
  return bytes / 1024 ** 3;
}

export function formatStorageSizeGb(gb: number): string {
  if (gb <= 0) {
    return '0.0 GB';
  }
  if (gb < 1) {
    const mb = gb * 1024;
    const displayGb = Math.max(0.01, Math.floor((mb + 5) / 10) * 0.01);
    return `${displayGb.toFixed(2)} GB`;
  }
  return `${gb.toFixed(1)} GB`;
}

export function toSizesGb(
  sizeBytes: Record<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(sizeBytes).map(([id, bytes]) => [id, bytesToGigabytes(bytes)]),
  );
}

export type LocalAlbumCardModel = Pick<
  APIResponse.Album,
  'id' | 'name' | 'title' | 'cover' | 'totalMediaCount' | 'size'
> & {
  cullingCompleted: boolean;
  cullingHasUploads: boolean;
};

export function toAlbumCardModel(album: CulledAlbum): LocalAlbumCardModel {
  return {
    id: album.albumId,
    name: album.name,
    title: album.title,
    cover: album.cover,
    totalMediaCount: Math.max(
      album.totalPhotos,
      album.syncedMediaCount ?? 0,
    ),
    size: Math.max(
      bytesToGigabytes(album.totalStorage),
      album.syncedStorageGb ?? 0,
    ),
    cullingCompleted: album.cullingCompleted,
    cullingHasUploads: album.cullingHasUploads,
  };
}
