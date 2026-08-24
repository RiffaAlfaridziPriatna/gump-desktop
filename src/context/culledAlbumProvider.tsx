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
  pruneCancelledLocalImportPhotos,
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
import {
  clearSyncPhotoFromStore,
  syncPhotosFromStoreAwait,
} from '@/application/syncPhotoRepository';
import {container} from '@di/container';
import {TOKENS} from '@di/tokens';
import {IPhotoRepository} from '@/domain/repositories/IPhotoRepository';
import {createStateStore, StateStore} from '@lib/react/state';
import {FileAsset} from '@services/upload/types';
import {PropsWithChildren, useCallback, useEffect, useRef} from 'react';
import {Platform} from 'react-native';
import {
  CulledAlbumActions,
  CulledAlbumActionsContext,
  CulledAlbumToastMode,
  CulledAlbumUiContext,
  CulledAlbumUiState,
} from './culledAlbumContext';

function maxConcurrentUploadsForPlatform(): number {
  return Platform.OS === 'windows' ? 4 : 12;
}

function maxConcurrentServerUploadsForPlatform(): number {
  return Platform.OS === 'windows' ? 3 : 8;
}

function maxConcurrentAnalysisForPlatform(): number {
  switch (Platform.OS) {
    case 'macos':
    case 'ios':
      return 8;
    case 'windows':
      return 2;
    default:
      return 6;
  }
}

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
      maxConcurrent: maxConcurrentUploadsForPlatform(),
      importPhotosUseCase: getUseCases().importPhotos,
      getPhotos: getPhotosForAlbum,
      getPhoto: getPhotoById,
      updatePhoto,
      persistAlbum,
    });
  }

  if (!serverUploadQueueRef.current) {
    serverUploadQueueRef.current = createServerUploadQueue({
      maxConcurrent: maxConcurrentServerUploadsForPlatform(),
      uploadSelectedPhotosUseCase: getUseCases().uploadSelectedPhotos,
      getPhoto: getPhotoById,
      updatePhoto,
      persistAlbum,
      uploadPhoto: uploadServerPhoto,
    });
  }

  if (!analysisQueueRef.current) {
    analysisQueueRef.current = createAnalysisQueue({
      maxConcurrent: maxConcurrentAnalysisForPlatform(),
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
    uploadQueueRef.current!.beginBatch(albumId);
    uploadQueueRef.current!.processPending(albumId);
  }, []);

  const startAnalysis = useCallback((albumId: string) => {
    syncedAlbumsRef.current.delete(albumId);
    uiStoreRef.current!.setState({analyzeError: null});
    setQueueOperationStatus(albumId, 'analysis', 'active');

    queuePhotosForAnalysis(albumId);
    flushPendingPhotoUpdates();
    analysisQueueRef.current!.beginBatch(albumId);
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

  const requestCancelUpload = useCallback((albumId: string) => {
    uploadQueueRef.current!.requestCancel(albumId);
  }, []);

  const requestCancelAnalysis = useCallback((albumId: string) => {
    analysisQueueRef.current!.requestCancel(albumId);
  }, []);

  const failNotUploadedItems = useCallback(async (albumId: string, error?: string) => {
    await uploadQueueRef.current!.cancel(albumId, error ?? 'Upload cancelled');

    flushPendingPhotoUpdates();
    reconcileLocalImportBatchCounts(albumId);

    const albumBeforePrune = getAlbum(albumId);
    const batchPhotoIds = albumBeforePrune?.localImportBatchPhotoIds ?? [];
    const batchTotal =
      albumBeforePrune?.localImportBatchTotal || batchPhotoIds.length;
    const counts =
      albumBeforePrune && batchPhotoIds.length > 0
        ? countLocalImportBatchForAlbum(
            batchPhotoIds,
            batchTotal,
            photoId => getPhotoById(albumId, photoId),
          )
        : null;
    const uploadedCount = counts?.uploaded ?? 0;
    const failedCount =
      counts?.failed ?? Math.max(0, batchTotal - uploadedCount);

    const {uploadedPhotoIds, removedPhotoIds} =
      pruneCancelledLocalImportPhotos(albumId);

    for (const photoId of removedPhotoIds) {
      clearSyncPhotoFromStore(albumId, photoId);
    }

    finishLocalImportQueue(albumId, {
      status: uploadedCount > 0 ? 'completed' : 'failed',
      uploadedCount,
      failedCount,
    });

    if (uploadedPhotoIds.length > 0) {
      try {
        await syncPhotosFromStoreAwait(albumId, uploadedPhotoIds);
      } catch (syncError) {
        console.error(
          '[CulledAlbum] Failed to sync photos after upload cancel',
          albumId,
          syncError,
        );
      }
    }

    if (removedPhotoIds.length > 0) {
      const photoRepo = container.resolve<IPhotoRepository>(
        TOKENS.IPhotoRepository,
      );
      await Promise.all(
        removedPhotoIds.map(photoId =>
          photoRepo.delete(albumId, photoId).catch(() => undefined),
        ),
      );
    }

    await persistAlbum(albumId).catch(() => undefined);
  }, []);

  const failNotAnalyzedItems = useCallback(async (albumId: string, error?: string) => {
    syncedAlbumsRef.current.delete(albumId);
    setQueueOperationStatus(albumId, 'analysis', 'finalizing');
    await analysisQueueRef.current!.cancel(albumId, error ?? 'Analysis cancelled');
    flushPendingPhotoUpdates();
    reconcileAnalysisBatchCounts(albumId);

    const album = getAlbum(albumId);
    const batchPhotoIds = album?.analysisBatchPhotoIds ?? [];
    const analyzedCount =
      album?.analysisBatchCounts?.analyzed ??
      batchPhotoIds.reduce((count, photoId) => {
        const photo = getPhotoById(albumId, photoId);
        return photo?.analysisStatus === 'analyzed' ? count + 1 : count;
      }, 0);

    if (analyzedCount === 0) {
      uiStoreRef.current!.setState({
        analyzeError:
          error ?? 'All photos failed to analyze. Please try again.',
      });
      setQueueOperationStatus(albumId, 'analysis', 'failed');
      await persistAlbum(albumId).catch(() => undefined);
      return;
    }

    syncedAlbumsRef.current.add(albumId);
    try {
      await cullingEngine.completeAnalysis(albumId);
      await markCullingCompleted(albumId);
      setQueueOperationStatus(albumId, 'analysis', 'completed');
    } catch (completeError) {
      syncedAlbumsRef.current.delete(albumId);
      const message =
        completeError instanceof Error
          ? completeError.message
          : 'Failed to complete culling analysis';
      uiStoreRef.current!.setState({analyzeError: message});
      setQueueOperationStatus(albumId, 'analysis', 'failed');
      console.error(
        '[CulledAlbum] Failed to finalize analysis after cancel',
        completeError,
      );
    }
    await persistAlbum(albumId).catch(() => undefined);
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
    requestCancelUpload,
    requestCancelAnalysis,
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
