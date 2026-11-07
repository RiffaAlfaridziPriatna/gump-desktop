import {CulledAlbumFilterBar} from '@components/culling/CulledAlbumFilterBar';
import {UploadAwareModalShell} from '@components/navigation/UploadAwareModalShell';
import {
  CulledAlbumDetailSidebar,
} from '@components/culling/CulledAlbumDetailSidebar';
import {CulledAlbumGridWithSummary} from '@components/culling/CulledAlbumGridWithSummary';
import {PICK_PHOTOS_HINT} from '@components/culling/UploadPickedButton';
import {CulledAlbumDetailHeader} from '@components/culling/CulledAlbumDetailHeader';
import {ProfileMenuPopup} from '@components/navigation/ProfileMenu';
import {ApplyLookModal} from '@components/modals/ApplyLookModal';
import {ApplyLookScopeModal} from '@components/modals/ApplyLookScopeModal';
import {DeletePhotoModal} from '@components/modals/DeletePhotoModal';
import {ExportPhotosModal} from '@components/modals/ExportPhotosModal';
import {UploadModal} from '@components/modals/UploadModal';
import {
  UploadSelectedModal,
  type UploadSelectedPhase,
} from '@components/modals/UploadSelectedModal';
import {
  estimateUploadSizeGb,
} from '@application/plan/uploadStorageEstimate';
import {selectPreviewPhoto} from '@lib/culledAlbum/selectPreviewPhoto';
import {getLookLabel} from '@lib/look/lookCatalog';
import {FileAsset} from '@services/upload/types';
import {UploadToast} from '@components/upload/UploadToast';
import {
  useCulledAlbumActions,
  useCulledAlbumPhoto,
  useCulledAlbumPhotosState,
  useCulledAlbumServerUploadBatch,
  useCulledAlbumStore,
} from '@context/culledAlbum';
import {useCulledAlbumPhotos} from '@hooks/useCulledAlbumPhotos';
import {useCulledAlbumDetailData} from '@hooks/useCulledAlbumDetailData';
import {useCulledAlbumFilters} from '@hooks/useCulledAlbumFilters';
import {useAlbumLookFlow} from '@hooks/useAlbumLookFlow';
import {useAiSelectionFlow} from '@hooks/useAiSelectionFlow';
import {AiSelectionToast} from '@components/culling/AiSelectionToast';
import {DEFAULT_AI_SELECTION_LEVEL} from '@domain/valueObjects/AiSelection';
import {useGridFocus} from '@hooks/useGridFocus';
import {useStableGridPhotos} from '@hooks/useStableGridPhotos';
import {hasPickedOutsideView, usePickedPhotos} from '@hooks/usePickedPhotos';
import {usePreloadGridImages} from '@hooks/usePreloadGridImages';
import {useProfileMenu} from '@hooks/useProfileMenu';
import {useUploadAwareModalScreen} from '@hooks/useUploadAwareModalScreen';
import {
  computeServerUploadBatchByteProgress,
  countServerUploadBatchItems,
  isServerUploadBatchFinished,
} from '@lib/culledAlbum/serverUploadProgress';
import {getPhotoById, saveLastCullFilters} from '@lib/culledAlbum/store';
import {photoDetailParams} from '@lib/culledAlbum/photoDetailParams';
import {photoKey} from '@lib/culledAlbum/photoStateStore';
import {bumpPhotoVersion} from '@lib/culledAlbum/photoVersionStore';
import {captureAppEvent} from '@lib/observability/posthogClient';
import {useAlbumQueueOperation} from '@lib/culledAlbum/uploadQueueStore';
import {
  getUploadLookBakeState,
  subscribeUploadLookBake,
} from '@lib/look/uploadLookBake';
import {toFacesPanelPhoto} from '@lib/culling/facesPanelPhoto';
import {preloadImage} from '@lib/media/imagePreload';
import {
  resolveDetailDisplayUri,
  resolveGridDisplayUri,
} from '@lib/storage/localStorage';
import {hasInFlightServerUploads} from '@lib/culledAlbum/types';
import {colors} from '@lib/ui/colors';
import {fonts} from '@lib/ui/typography';
import {MainStackParamList} from '../app/MainNavigator';
import {StackScreenProps} from '@react-navigation/stack';
import {useLayout} from '@hooks/useLayout';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {Linking, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useIsFocused} from '@react-navigation/native';
import IconNoPhoto from '../assets/images/icon_no_photo.svg';

function useUploadLookBake(albumId: string) {
  return useSyncExternalStore(
    onStoreChange => subscribeUploadLookBake(albumId, onStoreChange),
    () => getUploadLookBakeState(albumId),
    () => getUploadLookBakeState(albumId),
  );
}

type Props = StackScreenProps<MainStackParamList, 'CulledAlbumDetail'>;

const DESKTOP_SIDEBAR_WIDTH = 246;
const CONTENT_COLUMN_GAP = 24;

export default function CulledAlbumDetailScreen({navigation, route}: Props) {
  const {albumId} = route.params;
  const openUploadProgress = route.params.openUploadProgress === true;
  const {shellProps, handleBack, handleBackPressIn} = useUploadAwareModalScreen(
    navigation,
    route.params.instant,
    {albumId},
  );
  const isFocused = useIsFocused();
  const profileMenu = useProfileMenu();
  const {resumeInFlightWork, startSelectedUpload, addPhotos} = useCulledAlbumActions();
  const {isMobileLayout, screenPaddingHorizontal, screenWidth} = useLayout();
  const {loadError, loadingPhotos} = useCulledAlbumPhotos(albumId);
  const albumPhotos = useCulledAlbumPhotosState(albumId);
  const albumRecord = useCulledAlbumStore(state => state.albums[albumId]);
  const cullingCompleted = albumRecord?.cullingCompleted ?? false;
  const cullingHasUploads = albumRecord?.cullingHasUploads ?? false;
  const albumName = albumRecord?.title ?? albumRecord?.name ?? 'Album';
  const albumLink = albumRecord?.link ?? '';
  const lastCullFilters = albumRecord?.lastCullFilters;
  const {batchPhotoIds, photos: batchPhotos} =
    useCulledAlbumServerUploadBatch(albumId);
  const lookBake = useUploadLookBake(albumId);

  // Photo detail may edit star/selection while this screen is freezeOnBlur'd;
  // re-bump that card's version on return so memo'd cells pick up store changes.
  const photoDetailReturnIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isFocused) {
      return;
    }
    resumeInFlightWork(albumId);
    const returnedPhotoId = photoDetailReturnIdRef.current;
    if (returnedPhotoId) {
      photoDetailReturnIdRef.current = null;
      bumpPhotoVersion(photoKey(albumId, returnedPhotoId));
    }
  }, [albumId, isFocused, resumeInFlightWork]);
  const {
    stats,
    isAnalyzing,
    toggleSelection,
    updateStarRating,
    deletePhoto,
  } = useCulledAlbumDetailData(albumId, albumPhotos, !loadingPhotos);

  const [photoToDelete, setPhotoToDelete] = useState<{
    photoId: string;
    fileName: string;
  } | null>(null);
  const [cullFiltersExpanded, setCullFiltersExpanded] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadPhase, setUploadPhase] =
    useState<UploadSelectedPhase>('confirm');
  const [uploadSessionPhotoCount, setUploadSessionPhotoCount] = useState(0);
  const [uploadSessionSizeGb, setUploadSessionSizeGb] = useState(0);
  const uploadModalDismissedRef = useRef(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showAddPhotosModal, setShowAddPhotosModal] = useState(false);
  const [mainContentWidth, setMainContentWidth] = useState(0);
  const lookFlow = useAlbumLookFlow(albumId, albumPhotos.length > 0);
  const defaultLookId = albumRecord?.defaultLookId ?? 'original';
  const aiSelectionFlow = useAiSelectionFlow(
    albumId,
    albumRecord?.aiSelectionLevel ?? DEFAULT_AI_SELECTION_LEVEL,
  );
  const {draftLevel, status, setDraftLevel, update} = aiSelectionFlow;
  const aiSelectionProps = useMemo(
    () => ({
      draftLevel,
      status,
      onLevelChange: setDraftLevel,
      onUpdate: update,
    }),
    [draftLevel, status, setDraftLevel, update],
  );
  const statusLookLabel =
    defaultLookId !== 'original' ? getLookLabel(defaultLookId) : undefined;
  const isBlockingModalOpen =
    photoToDelete !== null ||
    showUploadModal ||
    showExportModal ||
    lookFlow.pickerVisible ||
    lookFlow.scopeVisible ||
    showAddPhotosModal;

  useEffect(() => {
    setMainContentWidth(0);
  }, [albumId]);

  const estimatedMainContentWidth = useMemo(() => {
    const contentWidth = screenWidth - 2 * screenPaddingHorizontal;
    if (isMobileLayout) {
      return contentWidth;
    }
    return Math.max(0, contentWidth - DESKTOP_SIDEBAR_WIDTH - CONTENT_COLUMN_GAP);
  }, [isMobileLayout, screenPaddingHorizontal, screenWidth]);

  const layoutWidth =
    mainContentWidth > 0 ? mainContentWidth : Math.max(estimatedMainContentWidth, 1);

  const initialPreloadUris = useMemo(
    () =>
      albumPhotos
        .filter(photo => photo.status === 'uploaded')
        .slice(0, 9)
        .map(photo => resolveGridDisplayUri(photo.file))
        .filter((uri): uri is string => Boolean(uri)),
    [albumPhotos],
  );

  usePreloadGridImages(initialPreloadUris);

  const localImportQueue = useAlbumQueueOperation(albumId, 'upload');
  const analysisQueue = useAlbumQueueOperation(albumId, 'analyze');
  const isLocalImporting =
    localImportQueue.status === 'active' ||
    localImportQueue.status === 'finalizing';
  // Photo statuses flip to analyzed before the queue leaves active/finalizing
  // ("Finalizing analysis…"), so also gate on the analysis queue itself.
  const isAnalysisQueueBusy =
    analysisQueue.status === 'active' ||
    analysisQueue.status === 'finalizing';
  const cullingBusy = isAnalyzing || isLocalImporting || isAnalysisQueueBusy;
  const canDeletePhoto = cullingCompleted && !cullingBusy;

  const gridPhotos = useStableGridPhotos(albumPhotos, cullingBusy);

  const totalPhotos = gridPhotos.length;

  const {
    activeFilters,
    selectionFilter,
    starRatingFilter,
    gridView,
    filterCounts,
    hasActiveFilter,
    toggleFilter,
    clearFilters,
    setSelectionFilter,
    setStarRatingFilter,
  } = useCulledAlbumFilters(gridPhotos, stats, lastCullFilters, albumId);

  const {picked: pickedPhotos, pending: pendingUploadPhotos} =
    usePickedPhotos(albumPhotos);
  const actionCount = pickedPhotos.length;

  const handleOpenPhotoDetail = useCallback(
    (photoId: string, faceIndex?: number) => {
      const file = getPhotoById(albumId, photoId)?.file;
      if (file) {
        preloadImage(resolveDetailDisplayUri(file)).catch(() => undefined);
      }
      photoDetailReturnIdRef.current = photoId;
      navigation.navigate(
        'CulledAlbumPhotoDetail',
        photoDetailParams(
          albumId,
          photoId,
          gridView.photos.map(photo => photo.photoId),
          faceIndex,
        ),
      );
    },
    [albumId, gridView.photos, navigation],
  );

  const {focusedPhotoId, handleCardPress, clearFocus} = useGridFocus(
    gridView.photos,
    handleOpenPhotoDetail,
  );

  const focusedPhoto = useCulledAlbumPhoto(albumId, focusedPhotoId ?? '');
  const firstGridPhotoId = gridView.photos[0]?.photoId;
  const previewPhoto = lookFlow.pickerVisible
    ? selectPreviewPhoto(albumPhotos, focusedPhoto, firstGridPhotoId)
    : undefined;
  const focusedPanelPhoto = useMemo(
    () => (focusedPhoto ? toFacesPanelPhoto(focusedPhoto) : null),
    [focusedPhoto],
  );

  const handleDeletePhotoPress = useCallback(
    (photoId: string, fileName: string) => {
      setPhotoToDelete({photoId, fileName});
    },
    [],
  );

  const handleDeletePhoto = useCallback(async () => {
    if (!photoToDelete) {
      return;
    }
    const photoId = photoToDelete.photoId;
    setPhotoToDelete(null);
    try {
      await deletePhoto(photoId);
      captureAppEvent('photo_deleted', {
        albumId,
        photoId,
      });
    } catch (error) {
      console.error('[CulledAlbumDetailScreen] Failed to delete photo', error);
      captureAppEvent('photo_deleted_failed', {
        albumId,
        photoId,
      });
    }
  }, [albumId, deletePhoto, photoToDelete]);

  const handleStartUpload = useCallback(async () => {
    const photoIds = pendingUploadPhotos.map(photo => photo.photoId);
    if (photoIds.length === 0) {
      return;
    }
    const sizeGb = estimateUploadSizeGb(pendingUploadPhotos);
    try {
      saveLastCullFilters(albumId, activeFilters);
      uploadModalDismissedRef.current = false;
      setUploadSessionPhotoCount(photoIds.length);
      setUploadSessionSizeGb(sizeGb);
      startSelectedUpload(albumId, photoIds);
      setUploadPhase('uploading');
      setShowUploadModal(true);
    } catch (error) {
      console.error(
        '[CulledAlbumDetailScreen] Failed to upload selected',
        error,
      );
      throw error;
    }
  }, [activeFilters, albumId, pendingUploadPhotos, startSelectedUpload]);

  const handleCloseUploadModal = useCallback(() => {
    if (uploadPhase === 'uploading') {
      uploadModalDismissedRef.current = true;
    }
    setShowUploadModal(false);
    setUploadPhase('confirm');
  }, [uploadPhase]);

  const handleOpenAlbum = useCallback(async () => {
    if (albumLink) {
      try {
        await Linking.openURL(albumLink);
      } catch (error) {
        console.error(
          '[CulledAlbumDetailScreen] Failed to open album',
          error,
        );
      }
    }
    uploadModalDismissedRef.current = false;
    handleCloseUploadModal();
  }, [albumLink, handleCloseUploadModal]);

  const confirmUploadSizeGb = useMemo(
    () => estimateUploadSizeGb(pendingUploadPhotos),
    [pendingUploadPhotos],
  );

  const isApplyingLook = lookBake.status === 'baking';
  const byteProgress = useMemo(
    () => computeServerUploadBatchByteProgress(batchPhotos, batchPhotoIds),
    [batchPhotos, batchPhotoIds],
  );
  const uploadFinished =
    !isApplyingLook &&
    batchPhotoIds.length > 0 &&
    isServerUploadBatchFinished(batchPhotos, batchPhotoIds);
  const batchCounts = useMemo(
    () => countServerUploadBatchItems(batchPhotos, batchPhotoIds),
    [batchPhotos, batchPhotoIds],
  );
  const uploadProgressValue = isApplyingLook
    ? lookBake.percent / 100
    : byteProgress.progress;
  const modalPhotoCount =
    uploadPhase === 'confirm'
      ? pendingUploadPhotos.length
      : uploadSessionPhotoCount;
  const modalUploadSizeGb =
    uploadPhase === 'confirm' ? confirmUploadSizeGb : uploadSessionSizeGb;
  const sessionUploadBytes = modalUploadSizeGb * 1024 ** 3;
  const totalUploadBytes =
    byteProgress.totalBytes > 0 ? byteProgress.totalBytes : sessionUploadBytes;
  const uploadedBytes = isApplyingLook
    ? uploadProgressValue * totalUploadBytes
    : byteProgress.uploadedBytes;

  useEffect(() => {
    if (!showUploadModal || uploadPhase !== 'uploading' || !uploadFinished) {
      return;
    }
    setUploadSessionPhotoCount(current =>
      current > 0 ? current : batchCounts.completed || batchPhotoIds.length,
    );
    setUploadPhase('complete');
  }, [
    batchCounts.completed,
    batchPhotoIds.length,
    showUploadModal,
    uploadFinished,
    uploadPhase,
  ]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }

    if (openUploadProgress) {
      uploadModalDismissedRef.current = false;
    }

    const inFlight = hasInFlightServerUploads(albumRecord, albumPhotos);
    const shouldResume =
      openUploadProgress || (inFlight && batchPhotoIds.length > 0);
    if (!shouldResume || uploadModalDismissedRef.current) {
      return;
    }
    if (showUploadModal && uploadPhase === 'uploading') {
      if (openUploadProgress) {
        navigation.setParams({openUploadProgress: false});
      }
      return;
    }

    setUploadSessionPhotoCount(current =>
      current > 0 ? current : batchPhotoIds.length,
    );
    setUploadSessionSizeGb(current =>
      current > 0 ? current : estimateUploadSizeGb(batchPhotos),
    );
    setUploadPhase('uploading');
    setShowUploadModal(true);
    if (openUploadProgress) {
      navigation.setParams({openUploadProgress: false});
    }
  }, [
    albumPhotos,
    albumRecord,
    batchPhotoIds.length,
    batchPhotos,
    isFocused,
    navigation,
    openUploadProgress,
    showUploadModal,
    uploadPhase,
  ]);

  useEffect(() => {
    uploadModalDismissedRef.current = false;
  }, [albumId]);

  const actionAlbumPhotos = pickedPhotos;
  const exportPhotoCount = actionAlbumPhotos.length;

  const handleCullFiltersToggle = useCallback(() => {
    setCullFiltersExpanded(current => !current);
  }, []);

  const handleAddPhotosPress = useCallback(() => {
    if (cullingBusy) {
      return;
    }
    setShowAddPhotosModal(true);
  }, [cullingBusy]);

  const handleAddPhotosSelected = useCallback(
    (files: FileAsset[]) => {
      setShowAddPhotosModal(false);
      if (files.length === 0) {
        return;
      }
      addPhotos(albumId, files, {
        autoStartAnalysis: true,
        stabilizeDetailUiDuringImport: true,
        source: 'culled_add_more',
      });
    },
    [addPhotos, albumId],
  );

  const handleOpenExport = useCallback(() => {
    if (exportPhotoCount === 0) {
      return;
    }
    setShowExportModal(true);
  }, [exportPhotoCount]);

  const sidebarActionProps = {
    onUploadSelected: () => {
      if (pendingUploadPhotos.length === 0 || cullingBusy) {
        return;
      }
      uploadModalDismissedRef.current = false;
      setUploadPhase('confirm');
      setShowUploadModal(true);
    },
    onAddPhotos: handleAddPhotosPress,
    onExport: handleOpenExport,
    onEditPhotos: lookFlow.openFromEdit,
    editPhotosRef: lookFlow.editPhotosRef,
    uploaded: cullingHasUploads,
    uploadDisabled: pendingUploadPhotos.length === 0 || cullingBusy,
    uploadIncludesHidden: hasPickedOutsideView(pickedPhotos, gridView.photos),
    addPhotosDisabled: cullingBusy,
    exportDisabled: exportPhotoCount === 0,
    editPhotosDisabled: albumPhotos.length === 0,
  };

  return (
    <UploadAwareModalShell {...shellProps}>
      <SafeAreaView style={styles.container}>
      <View style={styles.screenShell}>
        <View
          style={styles.screenRoot}>
        <View
          style={styles.screenContent}
          pointerEvents={isBlockingModalOpen ? 'none' : 'auto'}>
        <CulledAlbumDetailHeader
          onBack={handleBack}
          onBackPressIn={handleBackPressIn}
          isMobileLayout={isMobileLayout}
          paddingHorizontal={screenPaddingHorizontal}
          profileMenu={profileMenu}
        />

        {mainContentWidth === 0 && (
          <View style={styles.layoutProbe} pointerEvents="none">
            <View
              style={[
                styles.content,
                {paddingHorizontal: screenPaddingHorizontal},
                isMobileLayout && styles.contentMobile,
              ]}>
              {!isMobileLayout && <View style={styles.sidebarProbe} />}
              <View
                style={styles.mainColumn}
                onLayout={event =>
                  setMainContentWidth(event.nativeEvent.layout.width)
                }
              />
            </View>
          </View>
        )}

        {loadError ? (
          <View style={styles.mainLoading}>
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
        ) : (
          <>
        <View
          style={[
            styles.filterBarRow,
            {paddingHorizontal: screenPaddingHorizontal},
          ]}>
          <CulledAlbumFilterBar
            selectionFilter={selectionFilter}
            starRatingFilter={starRatingFilter}
            onSelectionFilterChange={setSelectionFilter}
            onStarRatingFilterChange={setStarRatingFilter}
            lookLabel={statusLookLabel}
            changeLookDisabled={albumPhotos.length === 0}
            onChangeLook={lookFlow.openFromChange}
            changeLookRef={lookFlow.changeLookRef}
            isMobileLayout={isMobileLayout}
          />
        </View>

        <View
          style={[
            styles.content,
            {paddingHorizontal: screenPaddingHorizontal},
            isMobileLayout && styles.contentMobile,
          ]}>
          {isMobileLayout && (
            <CulledAlbumDetailSidebar
              isMobileLayout={isMobileLayout}
              totalPhotos={totalPhotos}
              actionCount={actionCount}
              selectionFilter={selectionFilter}
              hasActiveFilter={hasActiveFilter}
              onSelectionFilterChange={setSelectionFilter}
              onClearFilters={clearFilters}
              activeFilters={activeFilters}
              onToggleFilter={toggleFilter}
              filterCounts={filterCounts}
              cullFiltersExpanded={cullFiltersExpanded}
              onCullFiltersToggle={handleCullFiltersToggle}
              focusedPhoto={focusedPanelPhoto}
              aiSelection={aiSelectionProps}
              {...sidebarActionProps}
            />
          )}
          <View
            style={styles.mainColumn}
            onLayout={event => {
              const width = event.nativeEvent.layout.width;
              // Ignore collapsed layouts during import/analysis re-render storms
              // (near-zero width makes the grid render an empty black area).
              if (width < 80) {
                return;
              }
              setMainContentWidth(width);
            }}>
            {gridView.photos.length === 0 && !gridView.filter.noResults ? (
              <View style={styles.emptyState}>
                {selectionFilter !== 'selected' && (
                  <IconNoPhoto width={40} height={40} />
                )}
                <Text style={styles.emptyStateText}>
                  {selectionFilter === 'selected'
                    ? PICK_PHOTOS_HINT
                    : 'No photos to show.'}
                </Text>
              </View>
            ) : (
              <CulledAlbumGridWithSummary
                {...gridView}
                albumId={albumId}
                containerWidth={layoutWidth}
                isMobileLayout={isMobileLayout}
                canDeletePhoto={canDeletePhoto}
                hoverEnabled={!isBlockingModalOpen && !cullingBusy}
                deferHeavyMediaWork={cullingBusy}
                contentContainerStyle={[
                  styles.grid,
                  isMobileLayout && styles.gridMobile,
                ]}
                focusedPhotoId={focusedPhotoId}
                onCardPress={handleCardPress}
                onClearFocus={clearFocus}
                onOpenDetail={handleOpenPhotoDetail}
                onToggleSelection={toggleSelection}
                onDeletePress={handleDeletePhotoPress}
                onStarPress={updateStarRating}
              />
            )}
          </View>
          {!isMobileLayout && (
            <CulledAlbumDetailSidebar
              isMobileLayout={isMobileLayout}
              totalPhotos={totalPhotos}
              actionCount={actionCount}
              selectionFilter={selectionFilter}
              hasActiveFilter={hasActiveFilter}
              onSelectionFilterChange={setSelectionFilter}
              onClearFilters={clearFilters}
              activeFilters={activeFilters}
              onToggleFilter={toggleFilter}
              filterCounts={filterCounts}
              cullFiltersExpanded={cullFiltersExpanded}
              onCullFiltersToggle={handleCullFiltersToggle}
              focusedPhoto={focusedPanelPhoto}
              aiSelection={aiSelectionProps}
              {...sidebarActionProps}
            />
          )}
        </View>

        <UploadToast mode="analyze" albumId={albumId} />
      <UploadToast mode="upload" albumId={albumId} />
        {aiSelectionFlow.status === 'updated' &&
        aiSelectionFlow.recommendedCount !== null &&
        aiSelectionFlow.lastAppliedLevel !== null ? (
          <AiSelectionToast
            variant="updated"
            level={aiSelectionFlow.lastAppliedLevel}
            count={aiSelectionFlow.recommendedCount}
            onDismiss={aiSelectionFlow.dismiss}
          />
        ) : null}
        {aiSelectionFlow.status === 'failed' ? (
          <AiSelectionToast
            variant="failed"
            onDismiss={aiSelectionFlow.dismiss}
          />
        ) : null}
          </>
        )}
        </View>

        <DeletePhotoModal
          visible={photoToDelete !== null}
          onClose={() => setPhotoToDelete(null)}
          onDelete={handleDeletePhoto}
        />

        <UploadSelectedModal
          visible={showUploadModal}
          albumId={albumId}
          phase={uploadPhase}
          photoCount={modalPhotoCount}
          uploadSizeGb={modalUploadSizeGb}
          uploadedBytes={uploadedBytes}
          totalUploadBytes={totalUploadBytes}
          uploadProgress={uploadProgressValue}
          isApplyingLook={isApplyingLook}
          bakeDiskFull={
            lookBake.status === 'failed' && lookBake.reason === 'diskFull'
              ? {requiredBytes: lookBake.requiredBytes}
              : undefined
          }
          onClose={handleCloseUploadModal}
          onUploadNow={handleStartUpload}
          onOpenAlbum={handleOpenAlbum}
          onRetryStarted={() => setUploadPhase('uploading')}
        />

        <ExportPhotosModal
          visible={showExportModal}
          photoCount={exportPhotoCount}
          albumId={albumId}
          albumName={albumName}
          selectedPhotos={actionAlbumPhotos}
          onClose={() => setShowExportModal(false)}
        />

        <ApplyLookModal
          visible={lookFlow.pickerVisible}
          albumName={albumName}
          previewPhoto={previewPhoto}
          currentLookId={defaultLookId}
          onUseLook={lookFlow.chooseLook}
          onClose={lookFlow.close}
        />

        <ApplyLookScopeModal
          visible={lookFlow.scopeVisible}
          lookLabel={lookFlow.chosenLookLabel}
          onApplyAll={lookFlow.applyAll}
          onApplyNewOnly={lookFlow.applyNewOnly}
          onClose={lookFlow.close}
        />

        <UploadModal
          visible={showAddPhotosModal}
          onClose={() => setShowAddPhotosModal(false)}
          onSelect={handleAddPhotosSelected}
        />

        </View>
      </View>
      <ProfileMenuPopup
        menu={profileMenu}
        rightOffset={screenPaddingHorizontal}
      />
    </SafeAreaView>
    </UploadAwareModalShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenShell: {
    flex: 1,
    position: 'relative',
  },
  screenRoot: {
    flex: 1,
  },
  screenContent: {
    flex: 1,
  },
  mainLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  layoutProbe: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
  },
  sidebarProbe: {
    width: DESKTOP_SIDEBAR_WIDTH,
  },
  filterBarRow: {},
  content: {
    flex: 1,
    flexDirection: 'row',
    gap: 24,
  },
  contentMobile: {
    flexDirection: 'column',
    gap: 0,
  },
  mainColumn: {
    flex: 1,
  },
  errorText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  emptyStateText: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.textMuted,
    textAlign: 'center',
  },
  grid: {
    paddingVertical: 24,
    paddingRight: 24,
  },
  gridMobile: {
    paddingRight: 0,
    paddingVertical: 12,
  },
});
