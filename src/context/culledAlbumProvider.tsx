import {cullingEngine} from '@lib/culling/cullingEngine';
import {createAnalysisQueue} from '@lib/culledAlbum/analysisQueue';
import {purgeLocalCulledAlbum} from '@lib/culledAlbum/service';
import {
  addPhotosToAlbum,
  getPhotoById,
  getPhotosForAlbum,
  markCullingCompleted,
  persistAlbum,
  queuePhotosForAnalysis,
  startServerUploadBatch,
  updatePhoto,
} from '@lib/culledAlbum/store';
import {
  createServerUploadQueue,
} from '@lib/culledAlbum/serverUploadQueue';
import {uploadServerPhoto} from '@lib/culledAlbum/serverUpload';
import {createUploadQueue} from '@lib/culledAlbum/uploadQueue';
import {createStateStore, StateStore} from '@lib/state';
import {getSimulatedUploadPerItemMinDurationMs} from '@lib/uploadToast';
import {FileAsset} from '@services/upload/types';
import {PropsWithChildren, useCallback, useRef} from 'react';
import {
  CulledAlbumActions,
  CulledAlbumActionsContext,
  CulledAlbumToastMode,
  CulledAlbumUiContext,
  CulledAlbumUiState,
} from './culledAlbumContext';

const MAX_CONCURRENT_UPLOADS = 4;
const MAX_CONCURRENT_SERVER_UPLOADS = 1;
const MAX_CONCURRENT_ANALYSIS = 2;

export function CulledAlbumProvider({children}: PropsWithChildren) {
  const uiStoreRef = useRef<StateStore<CulledAlbumUiState>>(null);
  const syncedAlbumsRef = useRef(new Set<string>());
  const uploadQueueRef = useRef<ReturnType<typeof createUploadQueue>>(null);
  const serverUploadQueueRef =
    useRef<ReturnType<typeof createServerUploadQueue>>(null);
  const analysisQueueRef = useRef<ReturnType<typeof createAnalysisQueue>>(null);

  if (!uiStoreRef.current) {
    uiStoreRef.current = createStateStore<CulledAlbumUiState>({
      uploadVisible: false,
      analyzeVisible: false,
      uploadError: null,
      analyzeError: null,
      activeUploadAlbumId: null,
      activeAnalyzeAlbumId: null,
    });
  }

  if (!uploadQueueRef.current) {
    uploadQueueRef.current = createUploadQueue({
      maxConcurrent: MAX_CONCURRENT_UPLOADS,
      getPhotos: getPhotosForAlbum,
      getPhoto: getPhotoById,
      updatePhoto,
      persistAlbum,
    });
  }

  if (!serverUploadQueueRef.current) {
    serverUploadQueueRef.current = createServerUploadQueue({
      maxConcurrent: MAX_CONCURRENT_SERVER_UPLOADS,
      getPhoto: getPhotoById,
      updatePhoto,
      persistAlbum,
      uploadPhoto: uploadServerPhoto,
    });
  }

  if (!analysisQueueRef.current) {
    analysisQueueRef.current = createAnalysisQueue({
      maxConcurrent: MAX_CONCURRENT_ANALYSIS,
      getPhotos: getPhotosForAlbum,
      updatePhoto,
      persistAlbum,
      isSynced: albumId => syncedAlbumsRef.current.has(albumId),
      markSynced: albumId => {
        syncedAlbumsRef.current.add(albumId);
      },
      unmarkSynced: albumId => {
        syncedAlbumsRef.current.delete(albumId);
      },
      onComplete: async albumId => {
        await cullingEngine.completeAnalysis(albumId);
        await markCullingCompleted(albumId);
      },
      onError: message => {
        uiStoreRef.current!.setState({analyzeError: message});
      },
    });
  }

  const addPhotos = useCallback((albumId: string, files: FileAsset[]) => {
    uiStoreRef.current!.setState({
      uploadError: null,
      uploadVisible: true,
      activeUploadAlbumId: albumId,
    });

    const perItemMinDurationMs = getSimulatedUploadPerItemMinDurationMs(
      files.length,
      MAX_CONCURRENT_UPLOADS,
    );
    addPhotosToAlbum(albumId, files, {simulatedMinDurationMs: perItemMinDurationMs});
    queueMicrotask(() => uploadQueueRef.current!.processPending(albumId));
  }, []);

  const startAnalysis = useCallback((albumId: string) => {
    syncedAlbumsRef.current.delete(albumId);
    uiStoreRef.current!.setState({
      analyzeError: null,
      analyzeVisible: true,
      activeAnalyzeAlbumId: albumId,
    });

    queuePhotosForAnalysis(albumId);
    queueMicrotask(() => analysisQueueRef.current!.processPending(albumId));
  }, []);

  const startSelectedUpload = useCallback(
    async (albumId: string, photoIds: string[]) => {
      startServerUploadBatch(albumId, photoIds);
      await persistAlbum(albumId);
      queueMicrotask(() =>
        serverUploadQueueRef.current!.processPending(albumId),
      );
    },
    [],
  );

  const purgeAlbum = useCallback(async (albumId: string) => {
    syncedAlbumsRef.current.delete(albumId);
    await purgeLocalCulledAlbum(albumId);
    uiStoreRef.current!.setState(state => {
      if (state.activeUploadAlbumId === albumId) {
        state.activeUploadAlbumId = null;
        state.uploadVisible = false;
      }
      if (state.activeAnalyzeAlbumId === albumId) {
        state.activeAnalyzeAlbumId = null;
        state.analyzeVisible = false;
      }
    });
  }, []);

  const hideToast = useCallback((mode: CulledAlbumToastMode) => {
    uiStoreRef.current!.setState(
      mode === 'upload' ? {uploadVisible: false} : {analyzeVisible: false},
    );
  }, []);

  const clearCompleted = useCallback((mode: CulledAlbumToastMode) => {
    if (mode === 'upload') {
      uiStoreRef.current!.setState({
        uploadVisible: false,
        activeUploadAlbumId: null,
      });
      return;
    }

    uiStoreRef.current!.setState({
      analyzeVisible: false,
      activeAnalyzeAlbumId: null,
    });
  }, []);

  const failNotUploadedItems = useCallback((error?: string) => {
    const albumId = uiStoreRef.current!.getState().activeUploadAlbumId;
    if (!albumId) {
      return;
    }
    for (const photo of getPhotosForAlbum(albumId)) {
      if (photo.status !== 'uploaded') {
        updatePhoto(albumId, photo.photoId, entry => {
          entry.status = 'failed';
          if (error && entry.error === undefined) {
            entry.error = error;
          }
        });
      }
    }
  }, []);

  const failNotAnalyzedItems = useCallback((error?: string) => {
    const albumId = uiStoreRef.current!.getState().activeAnalyzeAlbumId;
    if (!albumId) {
      return;
    }
    for (const photo of getPhotosForAlbum(albumId)) {
      if (photo.analysisStatus !== 'analyzed') {
        updatePhoto(albumId, photo.photoId, entry => {
          entry.analysisStatus = 'failed';
          if (error && entry.analysisError === undefined) {
            entry.analysisError = error;
          }
        });
      }
    }
  }, []);

  const actions: CulledAlbumActions = {
    addPhotos,
    startAnalysis,
    startSelectedUpload,
    purgeAlbum,
    hideToast,
    clearCompleted,
    failNotUploadedItems,
    failNotAnalyzedItems,
  };

  return (
    <CulledAlbumUiContext.Provider value={uiStoreRef.current}>
      <CulledAlbumActionsContext.Provider value={actions}>
        {children}
      </CulledAlbumActionsContext.Provider>
    </CulledAlbumUiContext.Provider>
  );
}
