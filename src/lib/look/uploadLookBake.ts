import {getPhotoById} from '@lib/culledAlbum/store';
import {
  bakeLooksForPhotos,
  photoNeedsLookBake,
  type BakeLookProgress,
} from '@lib/look/bakeLook';
import type {CulledAlbumPhoto} from '@lib/culledAlbum/types';

export type UploadLookBakeStatus = 'idle' | 'baking' | 'ready' | 'failed';

export type UploadLookBakeState = {
  status: UploadLookBakeStatus;
  completed: number;
  total: number;
  percent: number;
  error?: string;
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
  uriByPhotoId: Map<string, string>;
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
    uriByPhotoId: new Map(),
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

export function getBakedUploadUri(
  albumId: string,
  photoId: string,
): string | undefined {
  return sessions.get(albumId)?.uriByPhotoId.get(photoId);
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
  session.uriByPhotoId = new Map();
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

  session.uriByPhotoId = new Map();
  session.error = undefined;

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

  try {
    const uriByPhotoId = await bakeLooksForPhotos(
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
    session.uriByPhotoId = uriByPhotoId;
    session.status = 'ready';
    session.percent = 100;
    emit(albumId);
  } catch (error) {
    session.status = 'failed';
    session.error =
      error instanceof Error ? error.message : 'Failed to apply look';
    emit(albumId);
    throw error;
  }
}
