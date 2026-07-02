import {CulledAlbumFilterBar} from '@components/culling/CulledAlbumFilterBar';
import {
  CulledAlbumDetailSidebar,
  KeyFaceWithSource,
} from '@components/culling/CulledAlbumDetailSidebar';
import {CulledAlbumPhotoGrid} from '@components/culling/CulledAlbumPhotoGrid';
import {CulledAlbumDetailHeader} from '@components/culling/CulledAlbumDetailHeader';
import {DeletePhotoModal} from '@components/modals/DeletePhotoModal';
import {UploadSelectedConfirmModal} from '@components/modals/UploadSelectedConfirmModal';
import {UploadToast} from '@components/upload/UploadToast';
import {FaceStatusTooltip} from '@components/culling/FaceStatusTooltip';
import {
  useCulledAlbumActions,
  useCulledAlbumPhotosState,
  useCulledAlbumStore,
} from '@context/culledAlbum';
import {useCulledAlbumPhotos} from '@hooks/useCulledAlbumPhotos';
import {useCulledAlbumDetailData} from '@hooks/useCulledAlbumDetailData';
import {useCulledAlbumFilters} from '@hooks/useCulledAlbumFilters';
import {useKeyFaceTooltip} from '@hooks/useKeyFaceTooltip';
import {resolveKeyFaceSource} from '@lib/cullingFaceCrop';
import {cullingEngine} from '@lib/culling/cullingEngine';
import {getCulledAlbumGridLayout} from '@lib/culledAlbumGridLayout';
import {stabilizeGridPhotos} from '@lib/stableCulledAlbumGridPhotos';
import {toCullingPhoto, isCulledPhotoDisabled} from '@lib/culledAlbum/types';
import {colors} from '@lib/colors';
import {fonts} from '@lib/typography';
import {MainStackParamList} from '../app/MainNavigator';
import {StackScreenProps} from '@react-navigation/stack';
import {useLayout} from '@hooks/useLayout';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconNoPhoto from '../assets/images/icon_no_photo.svg';

type Props = StackScreenProps<MainStackParamList, 'CulledAlbumDetail'>;

export default function CulledAlbumDetailScreen({navigation, route}: Props) {
  const {albumId} = route.params;
  const {startSelectedUpload} = useCulledAlbumActions();
  const {isMobileLayout, screenPaddingHorizontal} = useLayout();

  const {photos, loadingPhotos, loadError} = useCulledAlbumPhotos(albumId);
  const albumPhotos = useCulledAlbumPhotosState(albumId);
  const cullingCompleted = useCulledAlbumStore(
    state => state.albums[albumId]?.cullingCompleted ?? false,
  );
  const cullingHasUploads = useCulledAlbumStore(
    state => state.albums[albumId]?.cullingHasUploads ?? false,
  );
  const albumName = useCulledAlbumStore(
    state =>
      state.albums[albumId]?.title ?? state.albums[albumId]?.name ?? 'Album',
  );
  const albumLink = useCulledAlbumStore(
    state => state.albums[albumId]?.link ?? '',
  );


  const {
    stats,
    keyFaces,
    loadingDetail,
    isAnalyzing,
    analyzedPhotoList,
    refreshDetail,
    toggleSelection,
    updateStarRating,
    deletePhoto,
    photoMap,
  } = useCulledAlbumDetailData(albumId, albumPhotos);

  const {
    screenRootRef,
    keyFaceTooltip,
    keyFaceTooltipWidth,
    screenOrigin,
    syncScreenOrigin,
    handleKeyFaceTooltipChange,
    dismissKeyFaceTooltip,
    setKeyFaceTooltipWidth,
  } = useKeyFaceTooltip();

  const gridPhotosCacheRef = useRef(new Map());
  const [photoToDelete, setPhotoToDelete] = useState<{
    photoId: string;
    fileName: string;
  } | null>(null);
  const [cullFiltersExpanded, setCullFiltersExpanded] = useState(true);
  const [keyFacesExpanded, setKeyFacesExpanded] = useState(true);
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);
  const [mainContentWidth, setMainContentWidth] = useState(0);

  const gridLayout = useMemo(
    () => getCulledAlbumGridLayout(mainContentWidth, isMobileLayout),
    [isMobileLayout, mainContentWidth],
  );
  const {cardWidth, columnCount, gap, itemHeight, rowHeight} = gridLayout;

  const canDeletePhoto = cullingCompleted && !isAnalyzing;

  const rawGridPhotos = useMemo(() => {
    return albumPhotos
      .filter(photo => photo.status === 'uploaded')
      .map(photo => ({
        file: photo.file,
        photoId: photo.photoId,
        disabled: isCulledPhotoDisabled(photo, cullingHasUploads),
        analysis:
          photo.analysisStatus === 'analyzed'
            ? toCullingPhoto(photo)
            : photoMap.get(photo.photoId),
      }));
  }, [albumPhotos, cullingHasUploads, photoMap]);

  const gridPhotos = useMemo(
    () => stabilizeGridPhotos(gridPhotosCacheRef.current, rawGridPhotos),
    [rawGridPhotos],
  );

  const {
    activeFilters,
    selectionFilter,
    starRatingFilter,
    filteredPhotos,
    filterCounts,
    selectedCount,
    toggleFilter,
    setSelectionFilter,
    setStarRatingFilter,
  } = useCulledAlbumFilters(gridPhotos, stats);

  const filesByPhotoId = useMemo(() => {
    const map = new Map<string, (typeof gridPhotos)[number]['file']>();
    for (const {photoId, file} of gridPhotos) {
      map.set(photoId, file);
    }
    return map;
  }, [gridPhotos]);

  const handleOpenPhotoDetail = useCallback(
    (photoId: string) => {
      navigation.navigate('CulledAlbumPhotoDetail', {albumId, photoId});
    },
    [albumId, navigation],
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
    await deletePhoto(photoToDelete.photoId);
    setPhotoToDelete(null);
  }, [deletePhoto, photoToDelete]);

  const handleStartUpload = useCallback(async () => {
    try {
      const {selectedPhotoIds} = await cullingEngine.finalize(albumId);
      if (selectedPhotoIds.length === 0) {
        return;
      }
      startSelectedUpload(albumId, selectedPhotoIds);
      setShowUploadConfirm(false);
      navigation.replace('CulledAlbumUploadProgress', {
        albumId,
        photoCount: selectedPhotoIds.length,
        albumName,
        albumLink,
      });
    } catch (error) {
      console.error(
        '[CulledAlbumDetailScreen] Failed to upload selected',
        error,
      );
      throw error;
    }
  }, [albumId, albumLink, albumName, navigation, startSelectedUpload]);

  const handleCullFiltersToggle = useCallback(() => {
    setCullFiltersExpanded(current => !current);
  }, []);

  const handleKeyFacesToggle = useCallback(() => {
    setKeyFacesExpanded(current => !current);
  }, []);

  useEffect(() => {
    syncScreenOrigin();
  }, [cullFiltersExpanded, keyFacesExpanded, syncScreenOrigin]);


  const keyFacesWithSources = useMemo<KeyFaceWithSource[]>(() => {
    return keyFaces.map(face => {
      const source = resolveKeyFaceSource(face, analyzedPhotoList, filesByPhotoId);
      return {
        ...face,
        uri: source?.uri,
        boundingBox: source?.boundingBox,
      };
    });
  }, [keyFaces, analyzedPhotoList, filesByPhotoId]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.screenShell}>
        <View
          ref={screenRootRef}
          style={styles.screenRoot}
          onLayout={syncScreenOrigin}>
        <CulledAlbumDetailHeader
          onBack={() => navigation.goBack()}
          isMobileLayout={isMobileLayout}
          paddingHorizontal={screenPaddingHorizontal}
        />

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
            onUploadSelected={() => setShowUploadConfirm(true)}
            selectedCount={selectedCount}
            uploaded={cullingHasUploads}
            uploadDisabled={selectedCount === 0}
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
              totalPhotos={stats?.totalPhotos ?? photos.length}
              selectedCount={selectedCount}
              selectionFilter={selectionFilter}
              onSelectionFilterChange={setSelectionFilter}
              activeFilters={activeFilters}
              onToggleFilter={toggleFilter}
              filterCounts={filterCounts}
              cullFiltersExpanded={cullFiltersExpanded}
              onCullFiltersToggle={handleCullFiltersToggle}
              keyFaces={keyFacesWithSources}
              keyFacesExpanded={keyFacesExpanded}
              onKeyFacesToggle={handleKeyFacesToggle}
              onKeyFaceTooltipChange={handleKeyFaceTooltipChange}
            />
          )}
          <View
            style={styles.mainColumn}
            onLayout={event =>
              setMainContentWidth(event.nativeEvent.layout.width)
            }>
            {loadingPhotos || loadingDetail || cardWidth <= 0 ? (
              <View style={styles.loading}>
                <ActivityIndicator size="large" color={colors.accent} />
              </View>
            ) : loadError ? (
              <View style={styles.loading}>
                <Text style={styles.errorText}>{loadError}</Text>
              </View>
            ) : filteredPhotos.length === 0 ? (
              <View style={styles.emptyState}>
                <IconNoPhoto width={40} height={40} />
                <Text style={styles.emptyStateText}>No photos to show.</Text>
              </View>
            ) : (
              <CulledAlbumPhotoGrid
                photos={filteredPhotos}
                cardWidth={cardWidth}
                columnCount={columnCount}
                gap={gap}
                itemHeight={itemHeight}
                rowHeight={rowHeight}
                isMobileLayout={isMobileLayout}
                canDeletePhoto={canDeletePhoto}
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
              totalPhotos={stats?.totalPhotos ?? photos.length}
              selectedCount={selectedCount}
              selectionFilter={selectionFilter}
              onSelectionFilterChange={setSelectionFilter}
              activeFilters={activeFilters}
              onToggleFilter={toggleFilter}
              filterCounts={filterCounts}
              cullFiltersExpanded={cullFiltersExpanded}
              onCullFiltersToggle={handleCullFiltersToggle}
              keyFaces={keyFacesWithSources}
              keyFacesExpanded={keyFacesExpanded}
              onKeyFacesToggle={handleKeyFacesToggle}
              onKeyFaceTooltipChange={handleKeyFaceTooltipChange}
            />
          )}
        </View>

        <UploadToast mode="analyze" albumId={albumId} />

        <DeletePhotoModal
          visible={photoToDelete !== null}
          onClose={() => setPhotoToDelete(null)}
          onDelete={handleDeletePhoto}
        />

        <UploadSelectedConfirmModal
          visible={showUploadConfirm}
          photoCount={selectedCount}
          albumName={albumName}
          onClose={() => setShowUploadConfirm(false)}
          onStartUpload={handleStartUpload}
        />
        </View>

        {keyFaceTooltip && (
          <View
            pointerEvents="none"
            style={[
              styles.keyFaceTooltipHost,
              {
                top: keyFaceTooltip.bottomY - screenOrigin.y + 6,
                left: keyFaceTooltip.centerX - screenOrigin.x,
                transform: [{translateX: -keyFaceTooltipWidth / 2}],
                opacity: keyFaceTooltipWidth > 0 ? 1 : 0,
              },
            ]}
            onLayout={event =>
              setKeyFaceTooltipWidth(event.nativeEvent.layout.width)
            }>
            <FaceStatusTooltip
              eyeMeta={keyFaceTooltip.eyeMeta}
              focusMeta={keyFaceTooltip.focusMeta}
            />
          </View>
        )}
      </View>
    </SafeAreaView>
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
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
