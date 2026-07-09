import {createStateStore, useStateStore} from '@lib/react/state';

export type QueueOperationStatus = 'idle' | 'active' | 'completed' | 'failed';

export type QueueOperation = {
  status: QueueOperationStatus;
  completionSeen: boolean;
  batchTotal: number;
  uploadedCount: number;
  failedCount: number;
};

export type AlbumQueueState = {
  localImport: QueueOperation;
  analysis: QueueOperation;
  serverUpload: QueueOperation;
};

export type UploadQueueStoreState = {
  queues: Record<string, AlbumQueueState>;
};

export type QueueToastMode = 'upload' | 'analyze' | 'serverUpload';

const defaultQueueOperation: QueueOperation = {
  status: 'idle',
  completionSeen: false,
  batchTotal: 0,
  uploadedCount: 0,
  failedCount: 0,
};

const defaultAlbumQueueState: AlbumQueueState = {
  localImport: {...defaultQueueOperation},
  analysis: {...defaultQueueOperation},
  serverUpload: {...defaultQueueOperation},
};

export const uploadQueueStore = createStateStore<UploadQueueStoreState>({
  queues: {},
});

export function queueOperationForMode(
  mode: QueueToastMode,
): keyof AlbumQueueState {
  switch (mode) {
    case 'upload':
      return 'localImport';
    case 'analyze':
      return 'analysis';
    case 'serverUpload':
      return 'serverUpload';
  }
}

export function getAlbumQueueState(albumId: string): AlbumQueueState {
  const state = uploadQueueStore.getState();
  return state.queues[albumId] ?? defaultAlbumQueueState;
}

export function useAlbumQueueOperation(
  albumId: string,
  mode: QueueToastMode,
): QueueOperation {
  const operation = queueOperationForMode(mode);
  return useStateStore(uploadQueueStore, state => {
    const queued = state.queues[albumId]?.[operation];
    if (!queued) {
      return defaultQueueOperation;
    }
    return queued;
  });
}

export function isQueueToastVisible(
  albumId: string,
  mode: QueueToastMode,
): boolean {
  const operation = queueOperationForMode(mode);
  const {status, completionSeen} = getAlbumQueueState(albumId)[operation];

  if (status === 'active') {
    return true;
  }

  return (status === 'completed' || status === 'failed') && !completionSeen;
}

export function beginLocalImportQueue(
  albumId: string,
  batchTotal: number,
  progress?: {uploadedCount?: number; failedCount?: number},
): void {
  uploadQueueStore.setState(state => {
    if (!state.queues[albumId]) {
      state.queues[albumId] = {...defaultAlbumQueueState};
    }
    state.queues[albumId].localImport = {
      status: 'active',
      completionSeen: false,
      batchTotal,
      uploadedCount: progress?.uploadedCount ?? 0,
      failedCount: progress?.failedCount ?? 0,
    };
  });
  console.info('[localImport] started', new Date().toISOString());
}

export type FinishLocalImportQueueInput = {
  status: Extract<QueueOperationStatus, 'completed' | 'failed'>;
  uploadedCount: number;
  failedCount: number;
};

export function finishLocalImportQueue(
  albumId: string,
  result: FinishLocalImportQueueInput,
): void {
  uploadQueueStore.setState(state => {
    const current = state.queues[albumId]?.localImport ?? defaultQueueOperation;
    if (!state.queues[albumId]) {
      state.queues[albumId] = {...defaultAlbumQueueState};
    }
    state.queues[albumId].localImport = {
      ...current,
      status: result.status,
      completionSeen: false,
      uploadedCount: result.uploadedCount,
      failedCount: result.failedCount,
    };
  });
  console.info('[localImport] finished', new Date().toISOString());
}

export function setQueueOperationStatus(
  albumId: string,
  operation: keyof AlbumQueueState,
  status: QueueOperationStatus,
) {
  uploadQueueStore.setState(state => {
    if (!state.queues[albumId]) {
      state.queues[albumId] = {...defaultAlbumQueueState};
    }
    state.queues[albumId][operation].status = status;
    if (status === 'active') {
      state.queues[albumId][operation].completionSeen = false;
    }
    if (status === 'completed' || status === 'failed') {
      state.queues[albumId][operation].completionSeen = false;
    }
  });
}

export function markCompletionSeen(
  albumId: string,
  operation: keyof AlbumQueueState,
) {
  uploadQueueStore.setState(state => {
    if (state.queues[albumId]) {
      state.queues[albumId][operation].completionSeen = true;
    }
  });
}

export function resetQueueOperation(
  albumId: string,
  operation: keyof AlbumQueueState,
) {
  uploadQueueStore.setState(state => {
    if (state.queues[albumId]) {
      state.queues[albumId][operation] = {...defaultQueueOperation};
    }
  });
}

export function clearAlbumQueues(albumId: string) {
  uploadQueueStore.setState(state => {
    delete state.queues[albumId];
  });
}

export function hasActiveQueueWork(): boolean {
  for (const queue of Object.values(uploadQueueStore.getState().queues)) {
    if (
      queue.localImport.status === 'active' ||
      queue.analysis.status === 'active' ||
      queue.serverUpload.status === 'active'
    ) {
      return true;
    }
  }

  return false;
}

export function hasActiveQueueWorkForAlbum(albumId: string): boolean {
  const queue = uploadQueueStore.getState().queues[albumId];
  if (!queue) {
    return false;
  }

  return (
    queue.localImport.status === 'active' ||
    queue.analysis.status === 'active' ||
    queue.serverUpload.status === 'active'
  );
}
