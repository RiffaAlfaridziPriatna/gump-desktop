import {scheduleIdleWork} from '@lib/async/scheduleIdleWork';

type QueryResult = {
  rows: Array<Record<string, unknown>>;
};

type SyncExecute = (query: string, params?: unknown[]) => QueryResult;
type AsyncExecute = (query: string, params?: unknown[]) => Promise<QueryResult>;

const PHOTO_INDEX_COLUMNS: Array<{name: string; ddl: string}> = [
  {name: 'file_size', ddl: 'INTEGER NOT NULL DEFAULT 0'},
  {name: 'upload_status', ddl: "TEXT NOT NULL DEFAULT 'pending'"},
  {name: 'analysis_status', ddl: "TEXT NOT NULL DEFAULT 'idle'"},
  {name: 'server_upload_status', ddl: "TEXT NOT NULL DEFAULT 'idle'"},
];

const STATUS_COLUMN_BY_FIELD: Record<string, string> = {
  status: 'upload_status',
  analysisStatus: 'analysis_status',
  serverUploadStatus: 'server_upload_status',
};

export function statusColumnForField(statusField: string): string | null {
  return STATUS_COLUMN_BY_FIELD[statusField] ?? null;
}

function hasColumn(executeSync: SyncExecute, table: string, column: string): boolean {
  const result = executeSync(`PRAGMA table_info(${table})`);
  return result.rows.some(row => String(row.name) === column);
}

export function ensurePhotoIndexColumns(executeSync: SyncExecute): void {
  for (const column of PHOTO_INDEX_COLUMNS) {
    if (!hasColumn(executeSync, 'photos', column.name)) {
      executeSync(`ALTER TABLE photos ADD COLUMN ${column.name} ${column.ddl}`);
    }
  }
}

const BACKFILL_BATCH_SIZE = 100;

function parsePhotoMeta(data: string): {
  fileSize: number;
  uploadStatus: string;
  analysisStatus: string;
  serverUploadStatus: string;
} | null {
  try {
    const plain = JSON.parse(data) as Record<string, unknown>;
    const file = plain.file as {size?: number} | undefined;
    return {
      fileSize: typeof file?.size === 'number' ? file.size : 0,
      uploadStatus: String(plain.status ?? 'pending'),
      analysisStatus: String(plain.analysisStatus ?? 'idle'),
      serverUploadStatus: String(plain.serverUploadStatus ?? 'idle'),
    };
  } catch {
    return null;
  }
}

export function schedulePhotoMetaBackfill(
  executeSync: SyncExecute,
  executeAsync: AsyncExecute,
): void {
  scheduleIdleWork(() => {
    void backfillPhotoMetaChunked(executeSync, executeAsync, 0);
  });
}

async function backfillPhotoMetaChunked(
  executeSync: SyncExecute,
  executeAsync: AsyncExecute,
  offset: number,
): Promise<void> {
  const pending = executeSync(
    `SELECT rowid, data FROM photos
     WHERE file_size = 0
     ORDER BY rowid
     LIMIT ?`,
    [BACKFILL_BATCH_SIZE],
  );

  if (pending.rows.length === 0) {
    return;
  }

  await executeAsync('BEGIN TRANSACTION');
  try {
    for (const row of pending.rows) {
      const meta = parsePhotoMeta(String(row.data));
      if (!meta) {
        continue;
      }
      await executeAsync(
        `UPDATE photos
         SET file_size = ?, upload_status = ?, analysis_status = ?, server_upload_status = ?
         WHERE rowid = ?`,
        [
          meta.fileSize,
          meta.uploadStatus,
          meta.analysisStatus,
          meta.serverUploadStatus,
          row.rowid,
        ],
      );
    }
    await executeAsync('COMMIT');
  } catch (error) {
    await executeAsync('ROLLBACK');
    throw error;
  }

  if (pending.rows.length >= BACKFILL_BATCH_SIZE) {
    scheduleIdleWork(() => {
      void backfillPhotoMetaChunked(
        executeSync,
        executeAsync,
        offset + BACKFILL_BATCH_SIZE,
      );
    });
  }
}

export function ensurePhotoIndexColumnsTurbo(executeSql: SyncExecute): void {
  ensurePhotoIndexColumns(executeSql);
}
