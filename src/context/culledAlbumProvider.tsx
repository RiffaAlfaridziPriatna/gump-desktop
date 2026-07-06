import {cullingEngine} from '@lib/culling/cullingEngine';
import {createAnalysisQueue} from '@lib/culledAlbum/analysisQueue';
import {purgeLocalCulledAlbum} from '@lib/culledAlbum/service';
import {
  addPhotosToAlbum,
  clearAnalysisBatch,
  clearLocalImportBatch,
  getAlbum,
  getPhotoById,
  getPhotosForAlbum,
  markCullingCompleted,
  persistAlbum,
  queuePhotosForAnalysis,
  startServerUploadBatch,
  updatePhoto,
} from '@lib/culledAlbum/store';
import {createServerUploadQueue} from '@lib/culledAlbum/serverUploadQueue';
import {uploadServerPhoto} from '@lib/culledAlbum/serverUpload';
import {createUploadQueue} from '@lib/culledAlbum/uploadQueue';
import {
  clearAlbumQueues,
  markCompletionSeen,
  queueOperationForMode,
  resetQueueOperation,
  setQueueOperationStatus,
} from '@lib/culledAlbum/uploadQueueStore';
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
const MAX_CONCURRENT_SERVER_UPLOADS = 4;
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
      uploadError: null,
      analyzeError: null,
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
        setQueueOperationStatus(albumId, 'analysis', 'completed');
      },
      onError: (albumId, message) => {
        uiStoreRef.current!.setState({analyzeError: message});
        setQueueOperationStatus(albumId, 'analysis', 'failed');
      },
    });
  }

  const resumeLocalImport = useCallback((albumId: string) => {
    const album = getAlbum(albumId);
    if (!album) {
      return;
    }

    const hasPending = album.photos.some(
      photo => photo.status === 'pending' || photo.status === 'uploading',
    );
    if (!hasPending) {
      return;
    }

    if (album.localImportBatchPhotoIds.length > 0) {
      setQueueOperationStatus(albumId, 'localImport', 'active');
    }
    uploadQueueRef.current!.processPending(albumId);
  }, []);

  const addPhotos = useCallback((albumId: string, files: FileAsset[]) => {
    const perItemMinDurationMs = getSimulatedUploadPerItemMinDurationMs(
      files.length,
      MAX_CONCURRENT_UPLOADS,
    );
    addPhotosToAlbum(albumId, files, {simulatedMinDurationMs: perItemMinDurationMs});

    uiStoreRef.current!.setState({uploadError: null});
    setQueueOperationStatus(albumId, 'localImport', 'active');
    uploadQueueRef.current!.processPending(albumId);
  }, []);

  const startAnalysis = useCallback((albumId: string) => {
    syncedAlbumsRef.current.delete(albumId);
    uiStoreRef.current!.setState({analyzeError: null});
    setQueueOperationStatus(albumId, 'analysis', 'active');

    queuePhotosForAnalysis(albumId);
    queueMicrotask(() => analysisQueueRef.current!.processPending(albumId));
  }, []);

  const startSelectedUpload = useCallback((albumId: string, photoIds: string[]) => {
    startServerUploadBatch(albumId, photoIds);
    serverUploadQueueRef.current!.resetActiveUploadCount(albumId);
    setQueueOperationStatus(albumId, 'serverUpload', 'active');
    persistAlbum(albumId).catch(() => undefined);
    serverUploadQueueRef.current!.processPending(albumId);
  }, []);

  const purgeAlbum = useCallback(async (albumId: string) => {
    syncedAlbumsRef.current.delete(albumId);
    await purgeLocalCulledAlbum(albumId);
    clearAlbumQueues(albumId);
  }, []);

  const hideToast = useCallback((mode: CulledAlbumToastMode, albumId: string) => {
    markCompletionSeen(albumId, queueOperationForMode(mode));
  }, []);

  const clearCompleted = useCallback((mode: CulledAlbumToastMode, albumId: string) => {
    const operation = queueOperationForMode(mode);

    if (mode === 'upload') {
      clearLocalImportBatch(albumId);
      persistAlbum(albumId).catch(() => undefined);
    } else if (mode === 'analyze') {
      clearAnalysisBatch(albumId);
      persistAlbum(albumId).catch(() => undefined);
    }

    resetQueueOperation(albumId, operation);
  }, []);

  const failNotUploadedItems = useCallback((albumId: string, error?: string) => {
    const batchPhotoIds = getAlbum(albumId)?.localImportBatchPhotoIds ?? [];
    const photoIds =
      batchPhotoIds.length > 0
        ? batchPhotoIds
        : getPhotosForAlbum(albumId)
            .filter(photo => photo.status !== 'uploaded')
            .map(photo => photo.photoId);

    for (const photoId of photoIds) {
      updatePhoto(albumId, photoId, entry => {
        if (entry.status !== 'uploaded') {
          entry.status = 'failed';
          if (error && entry.error === undefined) {
            entry.error = error;
          }
        }
      });
    }

    setQueueOperationStatus(albumId, 'localImport', 'failed');
  }, []);

  const failNotAnalyzedItems = useCallback((albumId: string, error?: string) => {
    const batchPhotoIds = getAlbum(albumId)?.analysisBatchPhotoIds ?? [];
    const photoIds =
      batchPhotoIds.length > 0
        ? batchPhotoIds
        : getPhotosForAlbum(albumId)
            .filter(photo => photo.analysisStatus !== 'analyzed')
            .map(photo => photo.photoId);

    for (const photoId of photoIds) {
      updatePhoto(albumId, photoId, entry => {
        if (entry.analysisStatus !== 'analyzed') {
          entry.analysisStatus = 'failed';
          if (error && entry.analysisError === undefined) {
            entry.analysisError = error;
          }
        }
      });
    }

    setQueueOperationStatus(albumId, 'analysis', 'failed');
  }, []);

  const actions: CulledAlbumActions = {
    addPhotos,
    resumeLocalImport,
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
