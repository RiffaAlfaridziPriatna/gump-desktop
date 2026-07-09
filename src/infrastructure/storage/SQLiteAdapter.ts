import type {PhotoStorageRow} from './photoStorageMeta';

export type {PhotoStorageRow};

export interface SQLiteAdapter {
  initialize(): void;
  saveAlbum(albumId: string, data: string): Promise<void>;
  loadAlbum(albumId: string): string | null;
  deleteAlbum(albumId: string): Promise<void>;
  listAlbumIds(): string[];
  savePhoto(albumId: string, row: PhotoStorageRow): Promise<void>;
  loadPhoto(albumId: string, photoId: string): string | null;
  deletePhoto(albumId: string, photoId: string): Promise<void>;
  savePhotos(albumId: string, rows: PhotoStorageRow[]): Promise<void>;
  loadPhotoIds(albumId: string): string[];
  loadPhotos(
    albumId: string,
    photoIds: string[],
  ): Array<{photoId: string; data: string}>;
  countPhotos(albumId: string): number;
  sumPhotoFileSizeByAlbum(albumId: string): number;
  countByStatus(albumId: string, statusField: string, statusValue: string): number;
  deletePhotosByAlbum(albumId: string): Promise<void>;
}
