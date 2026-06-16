import {useContextOrThrow} from '@lib/context';
import {uploadPhotoLocally} from '@lib/localPhotoUpload';
import {createStateStore, StateStore, useStateStore} from '@lib/state';
import {getSimulatedUploadPerItemMinDurationMs} from '@lib/uploadToast';
import {FileAsset} from '@services/upload/types';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useRef,
} from 'react';

export type UploadItem = {
  key: string;
  file: FileAsset;
  localFile?: FileAsset;
  progress: number;
  status: 'pending' | 'uploading' | 'uploaded' | 'failed';
  error?: string;
  albumId: string;
  simulatedMinDurationMs?: number;
};

export type UploaderState = {
  uploads: UploadItem[];
  error: string | null;
  visible: boolean;
};

type UploaderActions = {
  addItems: (files: FileAsset[], albumId: string) => void;
  uploadPendingItems: () => void;
  setProgress: (key: string, progress: number) => void;
  setError: (error: string | null) => void;
  failItem: (key: string, error?: string) => void;
  failNotUploadedItems: (error?: string) => void;
  hideToast: () => void;
  clearCompleted: () => void;
};

const UploaderContext = createContext<StateStore<UploaderState> | null>(null);
UploaderContext.displayName = 'UploaderContext';

const UploaderActionsContext = createContext<UploaderActions | null>(null);
UploaderActionsContext.displayName = 'UploaderActionsContext';

const MAX_CONCURRENT_UPLOADS = 4;
const FAKE_PROGRESS_CAP = 95;
const FAKE_PROGRESS_TICK_MS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function UploaderProvider({children}: PropsWithChildren) {
  const storeRef = useRef<StateStore<UploaderState>>(null);

  if (!storeRef.current) {
    storeRef.current = createStateStore<UploaderState>({
      uploads: [],
      error: null,
      visible: false,
    });
  }

  const setProgress = useCallback((key: string, progress: number) => {
    storeRef.current!.setState(state => {
      const item = state.uploads.find(upload => upload.key === key);
      if (item && item.status !== 'failed') {
        item.progress = progress;
        item.status = progress >= 100 ? 'uploaded' : 'uploading';
      }
    });
  }, []);

  const failItem = useCallback((key: string, error?: string) => {
    storeRef.current!.setState(state => {
      const item = state.uploads.find(upload => upload.key === key);
      if (item && item.status !== 'uploaded') {
        item.status = 'failed';
        item.error = error;
      }
    });
  }, []);

  const failNotUploadedItems = useCallback((error?: string) => {
    storeRef.current!.setState(state => {
      for (const item of state.uploads) {
        if (item.status !== 'uploaded') {
          item.status = 'failed';
          if (error && item.error === undefined) {
            item.error = error;
          }
        }
      }
    });
  }, []);

  const setError = useCallback((error: string | null) => {
    storeRef.current!.setState({error});
  }, []);

  const uploadItem = useCallback(
    (key: string) => {
      storeRef.current!.setState(state => {
        const item = state.uploads.find(upload => upload.key === key);
        if (item) {
          item.progress = 0;
          item.status = 'uploading';
          item.error = undefined;
        }
      });

      return new Promise<void>((resolve, reject) => {
        const item = storeRef.current!.getState().uploads.find(
          upload => upload.key === key,
        );
        if (!item) {
          reject(new Error('item not found'));
          return;
        }

        const startedAt = Date.now();
        const minDurationMs = item.simulatedMinDurationMs ?? 0;

        let fakeProgress = 0;
        let latestRealProgress = 0;
        let interval: ReturnType<typeof setInterval> | null = null;
        const itemKey = item.key;

        function safeSetProgress(progress: number) {
          setProgress(itemKey, progress);
        }

        interval = setInterval(() => {
          if (minDurationMs <= 0) return;
          const elapsed = Date.now() - startedAt;
          const t = Math.min(1, elapsed / minDurationMs);
          // Ease-out so it slows down near the cap.
          const eased = 1 - Math.pow(1 - t, 2);
          const target = Math.floor(eased * FAKE_PROGRESS_CAP);
          fakeProgress = Math.max(fakeProgress, Math.min(FAKE_PROGRESS_CAP, target));
          const merged = Math.max(fakeProgress, Math.min(FAKE_PROGRESS_CAP, latestRealProgress));
          if (merged > 0) safeSetProgress(merged);
        }, FAKE_PROGRESS_TICK_MS);

        uploadPhotoLocally(
          {file: item.file, albumId: item.albumId},
          progress => {
            latestRealProgress = progress;
            const merged = Math.max(
              fakeProgress,
              Math.min(FAKE_PROGRESS_CAP, Math.floor(progress)),
            );
            if (merged > 0) safeSetProgress(merged);
          },
        )
          .then(async localFile => {
            if (interval) clearInterval(interval);

            const elapsed = Date.now() - startedAt;
            const remaining = Math.max(0, minDurationMs - elapsed);
            if (remaining > 0) {
              await sleep(remaining);
            }

            storeRef.current!.setState(state => {
              const upload = state.uploads.find(entry => entry.key === key);
              if (upload) {
                upload.localFile = localFile;
              }
            });
            safeSetProgress(100);
            resolve();
          })
          .catch(err => {
            if (interval) clearInterval(interval);
            reject(err);
          });
      });
    },
    [setProgress],
  );

  const uploadPendingItems = useCallback(() => {
    let uploadingCount = 0;
    for (const item of storeRef.current!.getState().uploads) {
      if (uploadingCount >= MAX_CONCURRENT_UPLOADS) break;
      if (item.status === 'pending') {
        uploadItem(item.key)
          .then(() => uploadPendingItems())
          .catch(err => {
            const errorMessage =
              err instanceof Error && err.message ? err.message : undefined;
            failItem(item.key, errorMessage);
            uploadPendingItems();
          });
        uploadingCount++;
      } else if (item.status === 'uploading') {
        uploadingCount++;
      }
    }
  }, [failItem, uploadItem]);

  const addItems = useCallback(
    (files: FileAsset[], albumId: string) => {
      storeRef.current!.setState(state => {
        state.error = null;
        state.visible = true;
        const perItemMinDurationMs = getSimulatedUploadPerItemMinDurationMs(
          files.length,
          MAX_CONCURRENT_UPLOADS,
        );
        for (const file of files) {
          state.uploads.push({
            progress: 0,
            status: 'pending',
            file,
            albumId,
            simulatedMinDurationMs: perItemMinDurationMs,
            key:
              Math.random().toString(36).substring(2, 15) +
              Math.random().toString(36).substring(2, 15),
          });
        }
      });
      uploadPendingItems();
    },
    [uploadPendingItems],
  );

  const hideToast = useCallback(() => {
    storeRef.current!.setState({visible: false});
  }, []);

  const clearCompleted = useCallback(() => {
    storeRef.current!.setState(state => {
      state.uploads = state.uploads.filter(
        upload => upload.status !== 'uploaded',
      );
      if (state.uploads.length === 0) {
        state.visible = false;
      }
    });
  }, []);

  const actions: UploaderActions = {
    addItems,
    uploadPendingItems,
    setProgress,
    setError,
    failItem,
    failNotUploadedItems,
    hideToast,
    clearCompleted,
  };

  return (
    <UploaderContext.Provider value={storeRef.current}>
      <UploaderActionsContext.Provider value={actions}>
        {children}
      </UploaderActionsContext.Provider>
    </UploaderContext.Provider>
  );
}

export function useUploaderState<R = UploaderState>(
  selector?: (state: UploaderState) => R,
): R {
  return useStateStore(useContextOrThrow(UploaderContext), selector);
}

export function useUploaderActions(): UploaderActions {
  return useContextOrThrow(UploaderActionsContext);
}
