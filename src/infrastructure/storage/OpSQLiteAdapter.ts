import {open, type DB, type Scalar} from '@op-engineering/op-sqlite';
import {SQLiteAdapter} from './SQLiteAdapter';
import type {PhotoStorageRow} from './photoStorageMeta';
import {
  ensurePhotoIndexColumns,
  schedulePhotoMetaBackfill,
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

export class OpSQLiteAdapter implements SQLiteAdapter {
  private db: DB;
  private initialized = false;

  constructor() {
    this.db = open({name: DB_NAME});
  }

  initialize(): void {
    if (this.initialized) {
      return;
    }

    this.db.executeSync(`
      CREATE TABLE IF NOT EXISTS albums (
        album_id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    this.db.executeSync(`
      CREATE TABLE IF NOT EXISTS photos (
        album_id TEXT NOT NULL,
        photo_id TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (album_id, photo_id)
      );
    `);

    this.db.executeSync(`
      CREATE INDEX IF NOT EXISTS idx_photos_album ON photos(album_id);
    `);

    ensurePhotoIndexColumns((query, params) =>
      this.db.executeSync(query, params as Scalar[] | undefined),
    );
    schedulePhotoMetaBackfill(
      (query, params) =>
        this.db.executeSync(query, params as Scalar[] | undefined),
      (query, params) => this.db.execute(query, params as Scalar[] | undefined),
    );

    this.initialized = true;
  }

  saveAlbum(albumId: string, data: string): Promise<void> {
    return enqueueSQLiteWrite(async () => {
      await this.db.execute(
        'INSERT OR REPLACE INTO albums (album_id, data, updated_at) VALUES (?, ?, ?)',
        [albumId, data, Date.now()],
      );
    });
  }

  loadAlbum(albumId: string): string | null {
    const result = this.db.executeSync(
      'SELECT data FROM albums WHERE album_id = ?',
      [albumId],
    );
    if (result.rows.length > 0) {
      const value = result.rows[0]?.data;
      return typeof value === 'string' ? value : null;
    }
    return null;
  }

  deleteAlbum(albumId: string): Promise<void> {
    return enqueueSQLiteWrite(async () => {
      await this.db.execute('DELETE FROM albums WHERE album_id = ?', [albumId]);
    });
  }

  listAlbumIds(): string[] {
    const result = this.db.executeSync(
      'SELECT album_id FROM albums ORDER BY updated_at DESC',
    );
    return result.rows.map(row => String(row.album_id));
  }

  savePhoto(albumId: string, row: PhotoStorageRow): Promise<void> {
    return this.savePhotos(albumId, [row]);
  }

  loadPhoto(albumId: string, photoId: string): string | null {
    const result = this.db.executeSync(
      'SELECT data FROM photos WHERE album_id = ? AND photo_id = ?',
      [albumId, photoId],
    );
    if (result.rows.length > 0) {
      const value = result.rows[0]?.data;
      return typeof value === 'string' ? value : null;
    }
    return null;
  }

  deletePhoto(albumId: string, photoId: string): Promise<void> {
    return enqueueSQLiteWrite(async () => {
      await this.db.execute(
        'DELETE FROM photos WHERE album_id = ? AND photo_id = ?',
        [albumId, photoId],
      );
    });
  }

  savePhotos(albumId: string, rows: PhotoStorageRow[]): Promise<void> {
    if (rows.length === 0) {
      return Promise.resolve();
    }

    return enqueueSQLiteWrite(async () => {
      const now = Date.now();
      await this.db.execute('BEGIN TRANSACTION');
      try {
        for (const row of rows) {
          await this.db.execute(INSERT_PHOTO_SQL, [
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
        await this.db.execute('COMMIT');
      } catch (error) {
        await this.db.execute('ROLLBACK');
        throw error;
      }
    });
  }

  loadPhotoIds(albumId: string): string[] {
    const result = this.db.executeSync(
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
    const result = this.db.executeSync(
      `SELECT photo_id, data FROM photos WHERE album_id = ? AND photo_id IN (${placeholders})`,
      [albumId, ...photoIds],
    );

    return result.rows.map(row => ({
      photoId: String(row.photo_id),
      data: String(row.data),
    }));
  }

  countPhotos(albumId: string): number {
    const result = this.db.executeSync(
      'SELECT COUNT(*) as count FROM photos WHERE album_id = ?',
      [albumId],
    );
    if (result.rows.length > 0) {
      const value = result.rows[0]?.count;
      return typeof value === 'number' ? value : Number(value);
    }
    return 0;
  }

  sumPhotoFileSizeByAlbum(albumId: string): number {
    const result = this.db.executeSync(
      'SELECT COALESCE(SUM(file_size), 0) as total FROM photos WHERE album_id = ?',
      [albumId],
    );
    if (result.rows.length > 0) {
      const value = result.rows[0]?.total;
      return typeof value === 'number' ? value : Number(value);
    }
    return 0;
  }

  countByStatus(
    albumId: string,
    statusField: string,
    statusValue: string,
  ): number {
    const column = statusColumnForField(statusField);
    if (column) {
      const result = this.db.executeSync(
        `SELECT COUNT(*) as count FROM photos WHERE album_id = ? AND ${column} = ?`,
        [albumId, statusValue],
      );
      if (result.rows.length > 0) {
        const value = result.rows[0]?.count;
        return typeof value === 'number' ? value : Number(value);
      }
      return 0;
    }

    const result = this.db.executeSync(
      'SELECT data FROM photos WHERE album_id = ?',
      [albumId],
    );
    let count = 0;
    for (const row of result.rows) {
      try {
        const data = JSON.parse(String(row.data));
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
    return enqueueSQLiteWrite(async () => {
      await this.db.execute('DELETE FROM photos WHERE album_id = ?', [albumId]);
    });
  }
}
