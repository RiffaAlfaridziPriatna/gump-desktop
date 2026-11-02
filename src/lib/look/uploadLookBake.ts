import {getPhotoById} from '@lib/culledAlbum/store';
import {
  bakeLooksForPhotos,
  photoNeedsLookBake,
  type BakeLookProgress,
} from '@lib/look/bakeLook';
import type {CulledAlbumPhoto} from '@lib/culledAlbum/types';
import {
  DISK_SPACE_MARGIN_BYTES,
  estimateExportBytes,
  hasEnoughDiskSpace,
} from '@lib/export/diskSpace';
import {
  ensureExportStagingDirectory,
  getFreeDiskSpace,
} from '@lib/export/nativeExport';
import {toExportError} from '@lib/export/prepareExport';
import {ExportError} from '@lib/export/types';
import type {ExportFailureReason} from '@lib/export/types';
import {reportError} from '@lib/observability/reportError';

export type UploadLookBakeStatus = 'idle' | 'baking' | 'ready' | 'failed';

export type UploadLookBakeState = {
  status: UploadLookBakeStatus;
  completed: number;
  total: number;
  percent: number;
  error?: string;
  reason?: ExportFailureReason;
  requiredBytes?: number;
};

export type BakedUploadFile = {
  uri: string;
  size: number;
};

const IDLE_SNAPSHOT: UploadLookBakeState = Object.freeze({
  status: 'idle',
  completed: 0,
  total: 0,
  percent: 0,
});

type AlbumBakeSession = {
  status: UploadLookBakeStatus;
  completed: number;
  total: number;
  percent: number;
  error?: string;
  reason?: ExportFailureReason;
  requiredBytes?: number;
  fileByPhotoId: Map<string, BakedUploadFile>;
  listeners: Set<() => void>;
  snapshot: UploadLookBakeState;
};

const sessions = new Map<string, AlbumBakeSession>();

function buildSnapshot(session: AlbumBakeSession): UploadLookBakeState {
  return {
    status: session.status,
    completed: session.completed,
    total: session.total,
    percent: session.percent,
    error: session.error,
    reason: session.reason,
    requiredBytes: session.requiredBytes,
  };
}

function refreshSnapshot(session: AlbumBakeSession): void {
  session.snapshot = buildSnapshot(session);
}

function getOrCreateSession(albumId: string): AlbumBakeSession {
  const existing = sessions.get(albumId);
  if (existing) {
    return existing;
  }
  const created: AlbumBakeSession = {
    status: 'idle',
    completed: 0,
    total: 0,
    percent: 0,
    fileByPhotoId: new Map(),
    listeners: new Set(),
    snapshot: IDLE_SNAPSHOT,
  };
  sessions.set(albumId, created);
  return created;
}

function emit(albumId: string): void {
  const session = sessions.get(albumId);
  if (!session) {
    return;
  }
  refreshSnapshot(session);
  for (const listener of session.listeners) {
    listener();
  }
}

export function getUploadLookBakeState(albumId: string): UploadLookBakeState {
  return sessions.get(albumId)?.snapshot ?? IDLE_SNAPSHOT;
}

export function subscribeUploadLookBake(
  albumId: string,
  listener: () => void,
): () => void {
  const session = getOrCreateSession(albumId);
  session.listeners.add(listener);
  return () => {
    session.listeners.delete(listener);
  };
}

export function getBakedUploadFile(
  albumId: string,
  photoId: string,
): BakedUploadFile | undefined {
  return sessions.get(albumId)?.fileByPhotoId.get(photoId);
}

export function clearUploadLookBake(albumId: string): void {
  sessions.delete(albumId);
}

/** Mark baking immediately so upload resume cannot race ahead of bake. */
export function beginUploadLookBake(albumId: string, photoCount: number): void {
  const session = getOrCreateSession(albumId);
  session.status = 'baking';
  session.completed = 0;
  session.total = photoCount;
  session.percent = 0;
  session.error = undefined;
  session.reason = undefined;
  session.requiredBytes = undefined;
  session.fileByPhotoId = new Map();
  emit(albumId);
}

export function isUploadLookBakeBlocking(albumId: string): boolean {
  return getOrCreateSession(albumId).status === 'baking';
}

export function whenUploadLookBakeReady(
  albumId: string,
  onReady: () => void,
): () => void {
  if (!isUploadLookBakeBlocking(albumId)) {
    onReady();
    return () => undefined;
  }

  let unsubscribed = false;
  const unsubscribe = subscribeUploadLookBake(albumId, () => {
    if (unsubscribed || isUploadLookBakeBlocking(albumId)) {
      return;
    }
    unsubscribed = true;
    unsubscribe();
    onReady();
  });
  return () => {
    if (unsubscribed) {
      return;
    }
    unsubscribed = true;
    unsubscribe();
  };
}

export async function bakeLooksForUploadBatch(
  albumId: string,
  photoIds: string[],
): Promise<void> {
  const session = getOrCreateSession(albumId);
  const photos = photoIds
    .map(photoId => getPhotoById(albumId, photoId))
    .filter((photo): photo is CulledAlbumPhoto => Boolean(photo));
  const needingBake = photos.filter(photoNeedsLookBake);

  session.fileByPhotoId = new Map();
  session.error = undefined;
  session.reason = undefined;
  session.requiredBytes = undefined;

  if (needingBake.length === 0) {
    session.status = 'ready';
    session.completed = 0;
    session.total = 0;
    session.percent = 100;
    emit(albumId);
    return;
  }

  session.status = 'baking';
  session.completed = 0;
  session.total = needingBake.length;
  session.percent = 0;
  emit(albumId);

  const {totalBytes, missingSizeCount} = estimateExportBytes(needingBake);
  const requiredBytes = totalBytes + DISK_SPACE_MARGIN_BYTES;
  const context = {albumId, photoCount: needingBake.length, requiredBytes};
  if (missingSizeCount > 0) {
    reportError(new Error('Bake photos without file size'), {
      ...context,
      step: 'estimateBakeBytes',
      missingSizeCount,
    });
  }

  try {
    await assertStagingSpace(totalBytes, requiredBytes, context);
    const bakedByPhotoId = await bakeLooksForPhotos(
      needingBake,
      'original',
      (progress: BakeLookProgress) => {
        session.completed = progress.completed;
        session.total = progress.total;
        session.percent = progress.percent;
        session.status = 'baking';
        emit(albumId);
      },
    );
    const fileByPhotoId = new Map<string, BakedUploadFile>();
    for (const [photoId, baked] of bakedByPhotoId) {
      fileByPhotoId.set(photoId, {uri: baked.uri, size: baked.size});
    }
    session.fileByPhotoId = fileByPhotoId;
    session.status = 'ready';
    session.percent = 100;
    emit(albumId);
  } catch (error) {
    const failure = toExportError(error);
    session.status = 'failed';
    session.error =
      error instanceof Error ? error.message : 'Failed to apply look';
    session.reason = failure.reason;
    session.requiredBytes =
      failure.reason === 'diskFull' ? requiredBytes : undefined;
    emit(albumId);
    throw failure.reason === 'diskFull' ? failure : error;
  }
}

async function assertStagingSpace(
  payloadBytes: number,
  requiredBytes: number,
  context: Record<string, unknown>,
): Promise<void> {
  let availableBytes: number;
  try {
    const staging = await ensureExportStagingDirectory();
    ({availableBytes} = await getFreeDiskSpace(staging.path));
  } catch (error) {
    reportError(error, {...context, step: 'getFreeDiskSpace'});
    return;
  }
  if (!hasEnoughDiskSpace(availableBytes, payloadBytes)) {
    throw new ExportError('diskFull', 'Not enough disk space for look bake', {
      requiredBytes,
      context: {...context, availableBytes},
    });
  }
}
