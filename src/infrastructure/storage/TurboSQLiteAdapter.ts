import TurboSqlite, {type Database, type Params} from 'react-native-turbo-sqlite';
import {SQLiteAdapter} from './SQLiteAdapter';

const DB_NAME = 'gump.db';

export class TurboSQLiteAdapter implements SQLiteAdapter {
  private db: Database;
  private initialized = false;

  constructor() {
    this.db = TurboSqlite.openDatabase(DB_NAME);
  }

  initialize(): void {
    if (this.initialized) return;

    this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS albums (
        album_id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `, [] as Params);

    this.db.executeSql(`
      CREATE TABLE IF NOT EXISTS photos (
        album_id TEXT NOT NULL,
        photo_id TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (album_id, photo_id)
      );
    `, [] as Params);

    this.db.executeSql(`
      CREATE INDEX IF NOT EXISTS idx_photos_album ON photos(album_id);
    `, [] as Params);

    this.initialized = true;
  }

  saveAlbum(albumId: string, data: string): void {
    this.db.executeSql(
      'INSERT OR REPLACE INTO albums (album_id, data, updated_at) VALUES (?, ?, ?)',
      [albumId, data, Date.now()]
    );
  }

  loadAlbum(albumId: string): string | null {
    const result = this.db.executeSql(
      'SELECT data FROM albums WHERE album_id = ?',
      [albumId],
    );
    const row = result.rows?.[0];
    const value = row?.data;
    return typeof value === 'string' ? value : null;
    return null;
  }

  deleteAlbum(albumId: string): void {
    this.db.executeSql('DELETE FROM albums WHERE album_id = ?', [albumId]);
  }

  listAlbumIds(): string[] {
    const result = this.db.executeSql(
      'SELECT album_id FROM albums ORDER BY updated_at DESC',
      [] as Params,
    );
    return result.rows.map((row: any) => String(row.album_id));
  }

  savePhoto(albumId: string, photoId: string, data: string): void {
    this.db.executeSql(
      'INSERT OR REPLACE INTO photos (album_id, photo_id, data, updated_at) VALUES (?, ?, ?, ?)',
      [albumId, photoId, data, Date.now()]
    );
  }

  loadPhoto(albumId: string, photoId: string): string | null {
    const result = this.db.executeSql(
      'SELECT data FROM photos WHERE album_id = ? AND photo_id = ?',
      [albumId, photoId],
    );
    const row = result.rows?.[0];
    const value = row?.data;
    return typeof value === 'string' ? value : null;
    return null;
  }

  deletePhoto(albumId: string, photoId: string): void {
    this.db.executeSql(
      'DELETE FROM photos WHERE album_id = ? AND photo_id = ?',
      [albumId, photoId]
    );
  }

  savePhotos(albumId: string, photos: Array<{photoId: string; data: string}>): void {
    const now = Date.now();
    this.db.executeSql('BEGIN TRANSACTION', [] as Params);
    try {
      for (const photo of photos) {
        this.db.executeSql(
          'INSERT OR REPLACE INTO photos (album_id, photo_id, data, updated_at) VALUES (?, ?, ?, ?)',
          [albumId, photo.photoId, photo.data, now],
        );
      }
      this.db.executeSql('COMMIT', [] as Params);
    } catch (error) {
      this.db.executeSql('ROLLBACK', [] as Params);
      throw error;
    }
  }

  loadPhotoIds(albumId: string): string[] {
    const result = this.db.executeSql(
      'SELECT photo_id FROM photos WHERE album_id = ? ORDER BY updated_at ASC',
      [albumId],
    );
    return result.rows.map((row: any) => String(row.photo_id));
  }

  loadPhotos(albumId: string, photoIds: string[]): Array<{photoId: string; data: string}> {
    if (photoIds.length === 0) return [];

    const placeholders = photoIds.map(() => '?').join(',');
    const result = this.db.executeSql(
      `SELECT photo_id, data FROM photos WHERE album_id = ? AND photo_id IN (${placeholders})`,
      [albumId, ...photoIds]
    );

    return result.rows.map((row: any) => ({
      photoId: String(row.photo_id),
      data: String(row.data),
    }));
  }

  countPhotos(albumId: string): number {
    const result = this.db.executeSql(
      'SELECT COUNT(*) as count FROM photos WHERE album_id = ?',
      [albumId],
    );
    const row = result.rows?.[0];
    const value = row?.count;
    return typeof value === 'number' ? value : Number(value);
  }

  sumPhotoFileSizeByAlbum(albumId: string): number {
    const result = this.db.executeSql(
      'SELECT data FROM photos WHERE album_id = ?',
      [albumId],
    );

    let total = 0;
    for (const row of result.rows) {
      try {
        const data = JSON.parse(String((row as {data?: unknown}).data));
        const size = data?.file?.size;
        if (typeof size === 'number' && Number.isFinite(size)) {
          total += size;
        }
      } catch {
        continue;
      }
    }
    return total;
  }

  countByStatus(albumId: string, statusField: string, statusValue: string): number {
    const result = this.db.executeSql(
      'SELECT data FROM photos WHERE album_id = ?',
      [albumId],
    );
    let count = 0;
    for (const row of result.rows) {
      try {
        const data = JSON.parse(String((row as any).data));
        if (data[statusField] === statusValue) {
          count++;
        }
      } catch {
        continue;
      }
    }
    return count;
  }

  deletePhotosByAlbum(albumId: string): void {
    this.db.executeSql('DELETE FROM photos WHERE album_id = ?', [albumId]);
  }
}
