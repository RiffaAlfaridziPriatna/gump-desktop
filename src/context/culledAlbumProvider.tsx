import {cullingEngine} from '@lib/culling/cullingEngine';
import {resolveUseCases} from '@di/useCases';
import {createAnalysisQueue} from '@lib/culledAlbum/analysisQueue';
import {purgeLocalCulledAlbum} from '@lib/culledAlbum/service';
import {
  addPhotosToAlbum,
  clearAnalysisBatch,
  clearLocalImportBatch,
  culledAlbumStore,
  flushPendingPhotoUpdates,
  getAlbum,
  getPhotoById,
  getPhotosForAlbum,
  markCullingCompleted,
  persistAlbum,
  queuePhotosForAnalysis,
  reconcileAnalysisBatchCounts,
  reconcileLocalImportBatchCounts,
  startServerUploadBatch,
  updatePhoto,
} from '@lib/culledAlbum/store';
import {countLocalImportBatchForAlbum} from '@lib/culledAlbum/localImportProgress';
import {
  hasInFlightAnalysis,
  hasInFlightServerUploads,
  hasInFlightUploads,
} from '@lib/culledAlbum/types';
import {createServerUploadQueue} from '@lib/culledAlbum/serverUploadQueue';
import {uploadServerPhoto} from '@lib/culledAlbum/serverUpload';
import {createUploadQueue} from '@lib/culledAlbum/uploadQueue';
import {onUploadNavigationCoopEnd} from '@lib/navigation/uploadAwareNavigation';
import {
  beginLocalImportQueue,
  clearAlbumQueues,
  finishLocalImportQueue,
  markCompletionSeen,
  queueOperationForMode,
  resetQueueOperation,
  setQueueOperationStatus,
} from '@lib/culledAlbum/uploadQueueStore';
import {createStateStore, StateStore} from '@lib/react/state';
import {FileAsset} from '@services/upload/types';
import {PropsWithChildren, useCallback, useEffect, useRef} from 'react';
import {
  CulledAlbumActions,
  CulledAlbumActionsContext,
  CulledAlbumToastMode,
  CulledAlbumUiContext,
  CulledAlbumUiState,
} from './culledAlbumContext';

const MAX_CONCURRENT_UPLOADS = 8;
const MAX_CONCURRENT_SERVER_UPLOADS = 8;
const MAX_CONCURRENT_ANALYSIS = 4;

let cachedUseCases: ReturnType<typeof resolveUseCases> | null = null;

function getUseCases() {
  if (!cachedUseCases) {
    cachedUseCases = resolveUseCases();
  }
  return cachedUseCases;
}

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
      importPhotosUseCase: getUseCases().importPhotos,
      getPhotos: getPhotosForAlbum,
      getPhoto: getPhotoById,
      updatePhoto,
      persistAlbum,
    });
  }

  if (!serverUploadQueueRef.current) {
    serverUploadQueueRef.current = createServerUploadQueue({
      maxConcurrent: MAX_CONCURRENT_SERVER_UPLOADS,
      uploadSelectedPhotosUseCase: getUseCases().uploadSelectedPhotos,
      getPhoto: getPhotoById,
      updatePhoto,
      persistAlbum,
      uploadPhoto: uploadServerPhoto,
    });
  }

  if (!analysisQueueRef.current) {
    analysisQueueRef.current = createAnalysisQueue({
      maxConcurrent: MAX_CONCURRENT_ANALYSIS,
      analyzePhotoUseCase: getUseCases().analyzePhoto,
      getPhotos: getPhotosForAlbum,
      getPhoto: getPhotoById,
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
        setQueueOperationStatus(albumId, 'analysis', 'finalizing');
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

  const resumeInFlightWork = useCallback((albumId: string) => {
    const album = getAlbum(albumId);
    if (!album) {
      return;
    }

    const photos = getPhotosForAlbum(albumId);

    if (hasInFlightUploads(album, photos)) {
      if (album.localImportBatchPhotoIds.length > 0) {
        reconcileLocalImportBatchCounts(albumId);
        const batchTotal =
          album.localImportBatchTotal || album.localImportBatchPhotoIds.length;
        const counts = countLocalImportBatchForAlbum(
          album.localImportBatchPhotoIds,
          batchTotal,
          photoId => getPhotoById(albumId, photoId),
        );
        beginLocalImportQueue(albumId, batchTotal, {
          uploadedCount: counts.uploaded,
          failedCount: counts.failed,
        });
      }
      uploadQueueRef.current!.processPending(albumId);
    }

    if (hasInFlightAnalysis(album, photos)) {
      reconcileAnalysisBatchCounts(albumId);
      setQueueOperationStatus(albumId, 'analysis', 'active');
      analysisQueueRef.current!.processPending(albumId);
    }

    if (hasInFlightServerUploads(album, photos)) {
      setQueueOperationStatus(albumId, 'serverUpload', 'active');
      serverUploadQueueRef.current!.processPending(albumId);
    }
  }, []);

  useEffect(() => {
    return onUploadNavigationCoopEnd(() => {
      for (const albumId of Object.keys(culledAlbumStore.getState().albums)) {
        resumeInFlightWork(albumId);
      }
    });
  }, [resumeInFlightWork]);

  const resumeLocalImport = useCallback(
    (albumId: string) => {
      resumeInFlightWork(albumId);
    },
    [resumeInFlightWork],
  );

  const addPhotos = useCallback((albumId: string, files: FileAsset[]) => {
    const added = addPhotosToAlbum(albumId, files);

    uiStoreRef.current!.setState({uploadError: null});
    beginLocalImportQueue(albumId, added.length);
    uploadQueueRef.current!.processPending(albumId);
  }, []);

  const startAnalysis = useCallback((albumId: string) => {
    syncedAlbumsRef.current.delete(albumId);
    uiStoreRef.current!.setState({analyzeError: null});
    setQueueOperationStatus(albumId, 'analysis', 'active');

    queuePhotosForAnalysis(albumId);
    flushPendingPhotoUpdates();
    analysisQueueRef.current!.processPending(albumId);
  }, []);

  const startSelectedUpload = useCallback((albumId: string, photoIds: string[]) => {
    startServerUploadBatch(albumId, photoIds);
    flushPendingPhotoUpdates();
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
      const photo = getPhotoById(albumId, photoId);
      if (!photo || photo.status === 'uploaded') {
        continue;
      }

      updatePhoto(albumId, photoId, entry => {
        if (entry.status !== 'uploaded') {
          entry.status = 'failed';
          if (error && entry.error === undefined) {
            entry.error = error;
          }
        }
      }, {recomputeTotals: false});
    }

    flushPendingPhotoUpdates();
    reconcileLocalImportBatchCounts(albumId);
    const album = getAlbum(albumId);
    const batchTotal =
      album?.localImportBatchTotal || batchPhotoIds.length;
    const counts =
      album && batchPhotoIds.length > 0
        ? countLocalImportBatchForAlbum(
            batchPhotoIds,
            batchTotal,
            photoId => getPhotoById(albumId, photoId),
          )
        : null;
    finishLocalImportQueue(albumId, {
      status: 'failed',
      uploadedCount: counts?.uploaded ?? 0,
      failedCount: counts?.failed ?? batchTotal,
    });
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
    resumeInFlightWork,
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
