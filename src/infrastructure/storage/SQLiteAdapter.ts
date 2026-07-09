export interface SQLiteAdapter {
  initialize(): void;
  saveAlbum(albumId: string, data: string): void;
  loadAlbum(albumId: string): string | null;
  deleteAlbum(albumId: string): void;
  listAlbumIds(): string[];
  savePhoto(albumId: string, photoId: string, data: string): void;
  loadPhoto(albumId: string, photoId: string): string | null;
  deletePhoto(albumId: string, photoId: string): void;
  savePhotos(albumId: string, photos: Array<{photoId: string; data: string}>): void;
  loadPhotoIds(albumId: string): string[];
  loadPhotos(albumId: string, photoIds: string[]): Array<{photoId: string; data: string}>;
  countPhotos(albumId: string): number;
  sumPhotoFileSizeByAlbum(albumId: string): number;
  countByStatus(albumId: string, statusField: string, statusValue: string): number;
  deletePhotosByAlbum(albumId: string): void;
}
