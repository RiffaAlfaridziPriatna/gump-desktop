import {CulledAlbumFilterBar} from '@components/culling/CulledAlbumFilterBar';
import {UploadAwareModalShell} from '@components/navigation/UploadAwareModalShell';
import {
  CulledAlbumDetailSidebar,
} from '@components/culling/CulledAlbumDetailSidebar';
import {CulledAlbumPhotoGrid} from '@components/culling/CulledAlbumPhotoGrid';
import {CulledAlbumDetailHeader} from '@components/culling/CulledAlbumDetailHeader';
import {ProfileMenuPopup} from '@components/navigation/ProfileMenu';
import {HeaderPlanModal} from '@components/plan';
import {ApplyLookModal} from '@components/modals/ApplyLookModal';
import {DeletePhotoModal} from '@components/modals/DeletePhotoModal';
import {ExportPhotosModal} from '@components/modals/ExportPhotosModal';
import {
  UploadSelectedModal,
  type UploadSelectedPhase,
} from '@components/modals/UploadSelectedModal';
import {
  exportQualityLabel,
  estimateUploadSizeGb,
} from '@application/plan/uploadStorageEstimate';
import type {LookId} from '@lib/look/types';
import {UploadToast} from '@components/upload/UploadToast';
import {FaceStatusTooltip} from '@components/culling/FaceStatusTooltip';
import {
  useCulledAlbumActions,
  useCulledAlbumPhotosState,
  useCulledAlbumServerUploadBatch,
  useCulledAlbumStore,
} from '@context/culledAlbum';
import {useCulledAlbumPhotos} from '@hooks/useCulledAlbumPhotos';
import {useCulledAlbumDetailData} from '@hooks/useCulledAlbumDetailData';
import {useCulledAlbumFilters} from '@hooks/useCulledAlbumFilters';
import {usePreloadGridImages} from '@hooks/usePreloadGridImages';
import {useKeyFaceTooltip} from '@hooks/useKeyFaceTooltip';
import {usePlanMenu} from '@hooks/usePlanMenu';
import {useProfileMenu} from '@hooks/useProfileMenu';
import {useUploadAwareModalScreen} from '@hooks/useUploadAwareModalScreen';
import {cullingEngine} from '@lib/culling/cullingEngine';
import {
  computeServerUploadBatchByteProgress,
  countServerUploadBatchItems,
  isServerUploadBatchFinished,
} from '@lib/culledAlbum/serverUploadProgress';
import {getPhotoById, saveLastCullFilters} from '@lib/culledAlbum/store';
import {
  getUploadLookBakeState,
  subscribeUploadLookBake,
} from '@lib/look/uploadLookBake';
import {preloadImage, preloadImages} from '@lib/media/imagePreload';
import {
  resolveDetailDisplayUri,
  resolveGridDisplayUri,
} from '@lib/storage/localStorage';
import {stabilizeGridPhotos} from '@lib/culledAlbum/stableGridPhotos';
import {
  toCullingPhoto,
  isCulledPhotoDisabled,
  hasInFlightServerUploads,
} from '@lib/culledAlbum/types';
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
  const planMenu = usePlanMenu();
  const {resumeInFlightWork, startSelectedUpload} = useCulledAlbumActions();
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

  useEffect(() => {
    if (!isFocused) {
      return;
    }
    resumeInFlightWork(albumId);
  }, [albumId, isFocused, resumeInFlightWork]);
  const {
    stats,
    keyFaces,
    isAnalyzing,
    toggleSelection,
    updateStarRating,
    deletePhoto,
    photoMap,
  } = useCulledAlbumDetailData(albumId, albumPhotos, !loadingPhotos);

  const {
    screenRootRef,
    keyFaceTooltip,
    keyFaceTooltipWidth,
    keyFaceTooltipHeight,
    screenOrigin,
    syncScreenOrigin,
    handleKeyFaceTooltipChange,
    dismissKeyFaceTooltip,
    setKeyFaceTooltipWidth,
    setKeyFaceTooltipHeight,
  } = useKeyFaceTooltip();

  const gridPhotosCacheRef = useRef(new Map());
  const previousGridPhotosRef = useRef<
    ReturnType<typeof stabilizeGridPhotos>
  >([]);
  const [photoToDelete, setPhotoToDelete] = useState<{
    photoId: string;
    fileName: string;
  } | null>(null);
  const [cullFiltersExpanded, setCullFiltersExpanded] = useState(true);
  const [keyFacesExpanded, setKeyFacesExpanded] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadPhase, setUploadPhase] =
    useState<UploadSelectedPhase>('confirm');
  const [uploadSessionPhotoCount, setUploadSessionPhotoCount] = useState(0);
  const [uploadSessionSizeGb, setUploadSessionSizeGb] = useState(0);
  const uploadModalDismissedRef = useRef(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showApplyLookModal, setShowApplyLookModal] = useState(false);
  const [mainContentWidth, setMainContentWidth] = useState(0);
  const isBlockingModalOpen =
    photoToDelete !== null ||
    showUploadModal ||
    showExportModal ||
    showApplyLookModal ||
    planMenu.isOpen;

  useEffect(() => {
    if (!isBlockingModalOpen) {
      return;
    }
    dismissKeyFaceTooltip();
  }, [dismissKeyFaceTooltip, isBlockingModalOpen]);

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

  const canDeletePhoto = cullingCompleted && !isAnalyzing && !cullingHasUploads;

  const rawGridPhotos = useMemo(() => {
    return albumPhotos
      .filter(photo => photo.status === 'uploaded')
      .map(photo => ({
        photoId: photo.photoId,
        lookId: photo.lookId,
        lookIntensity: photo.lookIntensity,
        disabled: isCulledPhotoDisabled(photo, cullingHasUploads),
        analysis:
          photo.analysisStatus === 'analyzed'
            ? toCullingPhoto(photo)
            : photoMap.get(photo.photoId),
      }));
  }, [albumPhotos, cullingHasUploads, photoMap]);

  const gridPhotos = useMemo(() => {
    const stablePhotos = stabilizeGridPhotos(
      gridPhotosCacheRef.current,
      rawGridPhotos,
      previousGridPhotosRef.current,
    );
    previousGridPhotosRef.current = stablePhotos;
    return stablePhotos;
  }, [rawGridPhotos]);

  const totalPhotos = gridPhotos.length;

  const {
    activeFilters,
    selectionFilter,
    starRatingFilter,
    filteredPhotos,
    actionPhotos,
    filterCounts,
    selectedCount,
    actionCount,
    toggleFilter,
    setSelectionFilter,
    setStarRatingFilter,
  } = useCulledAlbumFilters(gridPhotos, stats, lastCullFilters);

  const handleOpenPhotoDetail = useCallback(
    (photoId: string, faceIndex?: number) => {
      const file = getPhotoById(albumId, photoId)?.file;
      if (file) {
        preloadImage(resolveDetailDisplayUri(file)).catch(() => undefined);
      }
      navigation.navigate('CulledAlbumPhotoDetail', {
        albumId,
        photoId,
        ...(typeof faceIndex === 'number' ? {faceIndex} : {}),
      });
    },
    [albumId, navigation],
  );

  const handleKeyFacePress = useCallback(
    (photoId: string, faceIndex?: number) => {
      dismissKeyFaceTooltip();
      handleOpenPhotoDetail(photoId, faceIndex);
    },
    [dismissKeyFaceTooltip, handleOpenPhotoDetail],
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
    await deletePhoto(photoId);
  }, [deletePhoto, photoToDelete]);

  const handleStartUpload = useCallback(async () => {
    const photoIds = actionPhotos.map(photo => photo.photoId);
    if (photoIds.length === 0) {
      return;
    }
    const selectedPhotos = albumPhotos.filter(photo =>
      photoIds.includes(photo.photoId),
    );
    const sizeGb = estimateUploadSizeGb(selectedPhotos);
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
  }, [actionPhotos, activeFilters, albumId, albumPhotos, startSelectedUpload]);

  const handleCloseUploadModal = useCallback(() => {
    if (uploadPhase === 'uploading') {
      uploadModalDismissedRef.current = true;
    }
    setShowUploadModal(false);
    setUploadPhase('confirm');
  }, [uploadPhase]);

  const handleUpgradeStorage = useCallback(() => {
    handleCloseUploadModal();
    planMenu.open();
  }, [handleCloseUploadModal, planMenu.open]);

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

  const storageUsedGb = planMenu.snapshot?.usage.storageGb.used ?? 0;
  const storageLimitGb = planMenu.snapshot?.usage.storageGb.limit ?? null;
  const confirmUploadSizeGb = useMemo(() => {
    const photoIds = new Set(actionPhotos.map(photo => photo.photoId));
    return estimateUploadSizeGb(
      albumPhotos.filter(photo => photoIds.has(photo.photoId)),
    );
  }, [actionPhotos, albumPhotos]);
  const exportLabel = planMenu.plan
    ? exportQualityLabel(planMenu.plan.exportQuality)
    : 'Compressed JPG';

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
    uploadPhase === 'confirm' ? actionCount : uploadSessionPhotoCount;
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

  const actionAlbumPhotos = useMemo(() => {
    const photosById = new Map(
      albumPhotos.map(photo => [photo.photoId, photo] as const),
    );
    return actionPhotos.flatMap(photo => {
      const albumPhoto = photosById.get(photo.photoId);
      return albumPhoto && albumPhoto.status === 'uploaded' ? [albumPhoto] : [];
    });
  }, [actionPhotos, albumPhotos]);
  const exportPhotoCount = actionAlbumPhotos.length;

  const handleCullFiltersToggle = useCallback(() => {
    setCullFiltersExpanded(current => !current);
  }, []);

  const handleKeyFacesToggle = useCallback(() => {
    setKeyFacesExpanded(current => !current);
  }, []);

  const handleOpenExport = useCallback(() => {
    if (exportPhotoCount === 0) {
      return;
    }
    setShowExportModal(true);
  }, [exportPhotoCount]);

  const handleOpenApplyLook = useCallback(() => {
    if (exportPhotoCount === 0) {
      return;
    }
    setShowApplyLookModal(true);
  }, [exportPhotoCount]);

  const handleApplyLook = useCallback(
    async (lookId: LookId, lookIntensity: number) => {
      const photoIds = actionAlbumPhotos.map(photo => photo.photoId);
      await cullingEngine.updateLook(albumId, photoIds, {
        lookId,
        lookIntensity,
      });
    },
    [albumId, actionAlbumPhotos],
  );

  const sidebarActionProps = {
    onUploadSelected: () => {
      if (actionCount === 0) {
        return;
      }
      uploadModalDismissedRef.current = false;
      setUploadPhase('confirm');
      setShowUploadModal(true);
    },
    onExport: handleOpenExport,
    onApplyLook: handleOpenApplyLook,
    uploaded: cullingHasUploads,
    uploadDisabled: actionCount === 0,
    exportDisabled: exportPhotoCount === 0,
    applyLookDisabled: exportPhotoCount === 0,
  };

  useEffect(() => {
    syncScreenOrigin();
  }, [cullFiltersExpanded, keyFacesExpanded, syncScreenOrigin]);


  const keyFaceDisplayUrisKey = useMemo(
    () =>
      [...new Set(
        keyFaces
          .map(face => face.cropUri)
          .filter((uri): uri is string => Boolean(uri)),
      )].join('\0'),
    [keyFaces],
  );

  useEffect(() => {
    if (!keyFaceDisplayUrisKey) {
      return;
    }

    preloadImages(keyFaceDisplayUrisKey.split('\0'), {concurrency: 8}).catch(
      () => undefined,
    );
  }, [keyFaceDisplayUrisKey]);

  return (
    <UploadAwareModalShell {...shellProps}>
      <SafeAreaView style={styles.container}>
      <View style={styles.screenShell}>
        <View
          ref={screenRootRef}
          style={styles.screenRoot}
          onLayout={syncScreenOrigin}>
        <View
          style={styles.screenContent}
          pointerEvents={isBlockingModalOpen ? 'none' : 'auto'}>
        <CulledAlbumDetailHeader
          onBack={handleBack}
          onBackPressIn={handleBackPressIn}
          isMobileLayout={isMobileLayout}
          paddingHorizontal={screenPaddingHorizontal}
          profileMenu={profileMenu}
          planMenu={planMenu}
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
              mySelectionsCount={selectedCount}
              actionCount={actionCount}
              selectionFilter={selectionFilter}
              onSelectionFilterChange={setSelectionFilter}
              activeFilters={activeFilters}
              onToggleFilter={toggleFilter}
              filterCounts={filterCounts}
              cullFiltersExpanded={cullFiltersExpanded}
              onCullFiltersToggle={handleCullFiltersToggle}
              keyFaces={keyFaces}
              keyFacesExpanded={keyFacesExpanded}
              onKeyFacesToggle={handleKeyFacesToggle}
              onKeyFaceTooltipChange={handleKeyFaceTooltipChange}
              onKeyFacePress={handleKeyFacePress}
              {...sidebarActionProps}
            />
          )}
          <View
            style={styles.mainColumn}
            onLayout={event =>
              setMainContentWidth(event.nativeEvent.layout.width)
            }>
            {filteredPhotos.length === 0 ? (
              <View style={styles.emptyState}>
                <IconNoPhoto width={40} height={40} />
                <Text style={styles.emptyStateText}>No photos to show.</Text>
              </View>
            ) : (
              <CulledAlbumPhotoGrid
                photos={filteredPhotos}
                albumId={albumId}
                containerWidth={layoutWidth}
                isMobileLayout={isMobileLayout}
                canDeletePhoto={canDeletePhoto}
                cullingHasUploads={cullingHasUploads}
                hoverEnabled={!isBlockingModalOpen}
                contentContainerStyle={[
                  styles.grid,
                  isMobileLayout && styles.gridMobile,
                ]}
                onOpenDetail={handleOpenPhotoDetail}
                onToggleSelection={toggleSelection}
                onDeletePress={handleDeletePhotoPress}
                onStarPress={updateStarRating}
                onScrollInteractionStart={dismissKeyFaceTooltip}
              />
            )}
          </View>
          {!isMobileLayout && (
            <CulledAlbumDetailSidebar
              isMobileLayout={isMobileLayout}
              totalPhotos={totalPhotos}
              mySelectionsCount={selectedCount}
              actionCount={actionCount}
              selectionFilter={selectionFilter}
              onSelectionFilterChange={setSelectionFilter}
              activeFilters={activeFilters}
              onToggleFilter={toggleFilter}
              filterCounts={filterCounts}
              cullFiltersExpanded={cullFiltersExpanded}
              onCullFiltersToggle={handleCullFiltersToggle}
              keyFaces={keyFaces}
              keyFacesExpanded={keyFacesExpanded}
              onKeyFacesToggle={handleKeyFacesToggle}
              onKeyFaceTooltipChange={handleKeyFaceTooltipChange}
              onKeyFacePress={handleKeyFacePress}
              {...sidebarActionProps}
            />
          )}
        </View>

        <UploadToast mode="analyze" albumId={albumId} />
      <UploadToast mode="upload" albumId={albumId} />
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
          phase={uploadPhase}
          photoCount={modalPhotoCount}
          storageUsedGb={storageUsedGb}
          storageLimitGb={storageLimitGb}
          uploadSizeGb={modalUploadSizeGb}
          uploadedBytes={uploadedBytes}
          totalUploadBytes={totalUploadBytes}
          uploadProgress={uploadProgressValue}
          isApplyingLook={isApplyingLook}
          exportQualityLabel={exportLabel}
          onClose={handleCloseUploadModal}
          onUploadNow={handleStartUpload}
          onUpgradeStorage={handleUpgradeStorage}
          onOpenAlbum={handleOpenAlbum}
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
          visible={showApplyLookModal}
          selectedPhotos={actionAlbumPhotos}
          onClose={() => setShowApplyLookModal(false)}
          onApply={handleApplyLook}
        />

        {keyFaceTooltip && (
          <View
            pointerEvents="none"
            style={[
              styles.keyFaceTooltipHost,
              {
                top:
                  keyFaceTooltip.placement === 'above'
                    ? (keyFaceTooltip.topY ?? keyFaceTooltip.bottomY) -
                      screenOrigin.y -
                      6
                    : keyFaceTooltip.bottomY - screenOrigin.y + 6,
                left: keyFaceTooltip.centerX - screenOrigin.x,
                transform:
                  keyFaceTooltip.placement === 'above'
                    ? [
                        {translateX: -keyFaceTooltipWidth / 2},
                        {translateY: -keyFaceTooltipHeight},
                      ]
                    : [{translateX: -keyFaceTooltipWidth / 2}],
                opacity:
                  keyFaceTooltipWidth > 0 &&
                  (keyFaceTooltip.placement !== 'above' ||
                    keyFaceTooltipHeight > 0)
                    ? 1
                    : 0,
              },
            ]}
            onLayout={event => {
              setKeyFaceTooltipWidth(event.nativeEvent.layout.width);
              setKeyFaceTooltipHeight(event.nativeEvent.layout.height);
            }}>
            <FaceStatusTooltip
              eyeMeta={keyFaceTooltip.eyeMeta}
              focusMeta={keyFaceTooltip.focusMeta}
              placement={keyFaceTooltip.placement}
            />
          </View>
        )}
        </View>
      </View>
      <ProfileMenuPopup
        menu={profileMenu}
        rightOffset={screenPaddingHorizontal}
      />
      <HeaderPlanModal planMenu={planMenu} />
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
  keyFaceTooltipHost: {
    position: 'absolute',
    zIndex: 1000,
  },
});
