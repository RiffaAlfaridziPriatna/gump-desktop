import {createStateStore, useStateStore} from '@lib/state';

export type QueueOperationStatus = 'idle' | 'active' | 'completed' | 'failed';

export type QueueOperation = {
  status: QueueOperationStatus;
  completionSeen: boolean;
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
