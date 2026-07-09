import TurboSqlite, {type Database, type Params} from 'react-native-turbo-sqlite';
import {SQLiteAdapter} from './SQLiteAdapter';
import type {PhotoStorageRow} from './photoStorageMeta';
import {
  ensurePhotoIndexColumnsTurbo,
  statusColumnForField,
} from './photoSchemaMigration';
import {enqueueSQLiteWrite} from './sqliteWriteQueue';

const DB_NAME = 'gump.db';

const INSERT_PHOTO_SQL = `
  INSERT OR REPLACE INTO photos (
    album_id,
    photo_id,
    data,
    updated_at,
    file_size,
    upload_status,
    analysis_status,
    server_upload_status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`;

function runDeferred<T>(work: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    setImmediate(() => {
      try {
        resolve(work());
      } catch (error) {
        reject(error);
      }
    });
  });
}

export class TurboSQLiteAdapter implements SQLiteAdapter {
  private db: Database;
  private initialized = false;

  constructor() {
    this.db = TurboSqlite.openDatabase(DB_NAME);
  }

  initialize(): void {
    if (this.initialized) {
      return;
    }

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

    ensurePhotoIndexColumnsTurbo((query, params) =>
      this.db.executeSql(query, (params ?? []) as Params),
    );

    this.initialized = true;
  }

  saveAlbum(albumId: string, data: string): Promise<void> {
    return enqueueSQLiteWrite(() =>
      runDeferred(() => {
        this.db.executeSql(
          'INSERT OR REPLACE INTO albums (album_id, data, updated_at) VALUES (?, ?, ?)',
          [albumId, data, Date.now()],
        );
      }),
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
  }

  deleteAlbum(albumId: string): Promise<void> {
    return enqueueSQLiteWrite(() =>
      runDeferred(() => {
        this.db.executeSql('DELETE FROM albums WHERE album_id = ?', [albumId]);
      }),
    );
  }

  listAlbumIds(): string[] {
    const result = this.db.executeSql(
      'SELECT album_id FROM albums ORDER BY updated_at DESC',
      [] as Params,
    );
    return result.rows.map(row => String(row.album_id));
  }

  savePhoto(albumId: string, row: PhotoStorageRow): Promise<void> {
    return this.savePhotos(albumId, [row]);
  }

  loadPhoto(albumId: string, photoId: string): string | null {
    const result = this.db.executeSql(
      'SELECT data FROM photos WHERE album_id = ? AND photo_id = ?',
      [albumId, photoId],
    );
    const row = result.rows?.[0];
    const value = row?.data;
    return typeof value === 'string' ? value : null;
  }

  deletePhoto(albumId: string, photoId: string): Promise<void> {
    return enqueueSQLiteWrite(() =>
      runDeferred(() => {
        this.db.executeSql(
          'DELETE FROM photos WHERE album_id = ? AND photo_id = ?',
          [albumId, photoId],
        );
      }),
    );
  }

  savePhotos(albumId: string, rows: PhotoStorageRow[]): Promise<void> {
    if (rows.length === 0) {
      return Promise.resolve();
    }

    return enqueueSQLiteWrite(() =>
      runDeferred(() => {
        const now = Date.now();
        this.db.executeSql('BEGIN TRANSACTION', [] as Params);
        try {
          for (const row of rows) {
            this.db.executeSql(INSERT_PHOTO_SQL, [
              albumId,
              row.photoId,
              row.data,
              now,
              row.fileSize,
              row.uploadStatus,
              row.analysisStatus,
              row.serverUploadStatus,
            ]);
          }
          this.db.executeSql('COMMIT', [] as Params);
        } catch (error) {
          this.db.executeSql('ROLLBACK', [] as Params);
          throw error;
        }
      }),
    );
  }

  loadPhotoIds(albumId: string): string[] {
    const result = this.db.executeSql(
      'SELECT photo_id FROM photos WHERE album_id = ? ORDER BY updated_at ASC',
      [albumId],
    );
    return result.rows.map(row => String(row.photo_id));
  }

  loadPhotos(
    albumId: string,
    photoIds: string[],
  ): Array<{photoId: string; data: string}> {
    if (photoIds.length === 0) {
      return [];
    }

    const placeholders = photoIds.map(() => '?').join(',');
    const result = this.db.executeSql(
      `SELECT photo_id, data FROM photos WHERE album_id = ? AND photo_id IN (${placeholders})`,
      [albumId, ...photoIds],
    );

    return result.rows.map(row => ({
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
      'SELECT COALESCE(SUM(file_size), 0) as total FROM photos WHERE album_id = ?',
      [albumId],
    );
    const row = result.rows?.[0];
    const value = row?.total;
    return typeof value === 'number' ? value : Number(value);
  }

  countByStatus(
    albumId: string,
    statusField: string,
    statusValue: string,
  ): number {
    const column = statusColumnForField(statusField);
    if (column) {
      const result = this.db.executeSql(
        `SELECT COUNT(*) as count FROM photos WHERE album_id = ? AND ${column} = ?`,
        [albumId, statusValue],
      );
      const row = result.rows?.[0];
      const value = row?.count;
      return typeof value === 'number' ? value : Number(value);
    }

    const result = this.db.executeSql(
      'SELECT data FROM photos WHERE album_id = ?',
      [albumId],
    );
    let count = 0;
    for (const row of result.rows) {
      try {
        const data = JSON.parse(String((row as {data?: unknown}).data));
        if (data[statusField] === statusValue) {
          count++;
        }
      } catch {
        continue;
      }
    }
    return count;
  }

  deletePhotosByAlbum(albumId: string): Promise<void> {
    return enqueueSQLiteWrite(() =>
      runDeferred(() => {
        this.db.executeSql('DELETE FROM photos WHERE album_id = ?', [albumId]);
      }),
    );
  }
}
