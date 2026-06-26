import { CulledAlbumFilterBar } from '@components/culling/CulledAlbumFilterBar';
import { CulledAlbumPhotoGrid } from '@components/culling/CulledAlbumPhotoGrid';
import { DeletePhotoModal } from '@components/modals/DeletePhotoModal';
import { UploadSelectedConfirmModal } from '@components/modals/UploadSelectedConfirmModal';
import { UploadToast } from '@components/upload/UploadToast';
import {FaceStatusTooltip, type KeyFaceTooltipAnchor} from '@components/culling/FaceStatusTooltip';
import {KeyFaceSidebarItem} from '@components/culling/KeyFaceSidebarItem';
import { Accordion } from '@components/ui/Accordion';
import {
  useCulledAlbumActions,
  useCulledAlbumPhotosState,
  useCulledAlbumStore,
} from '@context/culledAlbum';
import { useCulledAlbumPhotos } from '@hooks/useCulledAlbumPhotos';
import { resolveKeyFaceSource } from '@lib/cullingFaceCrop';
import {
  matchesCulledAlbumGridFilters,
  SelectionFilter,
  StarRatingFilter,
} from '@lib/culling/culledAlbumPhotoFilters';
import { cullingEngine } from '@lib/culling/cullingEngine';
import { getCulledAlbumGridLayout } from '@lib/culledAlbumGridLayout';
import { toCullingPhoto, isCulledPhotoDisabled } from '@lib/culledAlbum/types';
import { colors } from '@lib/colors';
import { fonts } from '@lib/typography';
import { MainStackParamList } from '../app/MainNavigator';
import { APIResponse } from '@services/api';
import { StackScreenProps } from '@react-navigation/stack';
import { useLayout } from '@hooks/useLayout';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IconCheckCircle from '../assets/images/icon_check_circle.svg';
import IconCheckCircleOutlined from '../assets/images/icon_check_circle_outlined.svg';
import IconChevronLeft from '../assets/images/icon_chevron_left.svg';
import IconNoPhoto from '../assets/images/icon_no_photo.svg';
import GumpLogo from '../assets/images/logo.svg';
import { Checkbox, Pressable, TouchableOpacity } from '@components/ui';

type Props = StackScreenProps<MainStackParamList, 'CulledAlbumDetail'>;

type FilterKey =
  | 'aiSelected'
  | 'maybe'
  | 'blurred'
  | 'closedEyes'
  | 'duplicated';

const FILTER_LABELS: Record<FilterKey, string> = {
  aiSelected: 'AI Selected',
  maybe: 'Maybe',
  blurred: 'Blurred',
  closedEyes: 'Closed Eyes',
  duplicated: 'Duplicated',
};

export default function CulledAlbumDetailScreen({ navigation, route }: Props) {
  const { albumId } = route.params;
  const { startSelectedUpload } = useCulledAlbumActions();
  const { isMobileLayout, screenPaddingHorizontal } = useLayout();

  const { photos, loadingPhotos, loadError } = useCulledAlbumPhotos(albumId);
  const albumPhotos = useCulledAlbumPhotosState(albumId);
  const cullingCompleted = useCulledAlbumStore(
    state => state.albums[albumId]?.cullingCompleted ?? false,
  );
  const cullingHasUploads = useCulledAlbumStore(
    state => state.albums[albumId]?.cullingHasUploads ?? false,
  );
  const albumName = useCulledAlbumStore(
    state => state.albums[albumId]?.title ?? state.albums[albumId]?.name ?? 'Album',
  );
  const albumLink = useCulledAlbumStore(
    state => state.albums[albumId]?.link ?? '',
  );

  const isAnalyzing = albumPhotos.some(
    photo =>
      photo.analysisStatus === 'pending' ||
      photo.analysisStatus === 'analyzing',
  );
  const canDeletePhoto = cullingCompleted && !isAnalyzing;

  const [analyzedPhotos, setAnalyzedPhotos] = useState<
    APIResponse.CullingPhoto[]
  >([]);
  const [stats, setStats] = useState<APIResponse.CullingStats | null>(null);
  const [keyFaces, setKeyFaces] = useState<APIResponse.CullingKeyFace[]>([]);
  const [activeFilters, setActiveFilters] = useState<
    Record<FilterKey, boolean>
  >({
    aiSelected: false,
    maybe: false,
    blurred: false,
    closedEyes: false,
    duplicated: false,
  });
  const [selectionFilter, setSelectionFilter] = useState<SelectionFilter>(null);
  const [starRatingFilter, setStarRatingFilter] = useState<StarRatingFilter>(
    [],
  );

  const [hoveredPhotoId, setHoveredPhotoId] = useState<string | null>(null);
  const [photoToDelete, setPhotoToDelete] = useState<{
    photoId: string;
    fileName: string;
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(true);

  const [cullFiltersExpanded, setCullFiltersExpanded] = useState(true);
  const [keyFacesExpanded, setKeyFacesExpanded] = useState(true);

  const [keyFaceTooltip, setKeyFaceTooltip] =
    useState<KeyFaceTooltipAnchor | null>(null);
  const [keyFaceTooltipWidth, setKeyFaceTooltipWidth] = useState(0);
  const [screenOrigin, setScreenOrigin] = useState({ x: 0, y: 0 });
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);

  const [mainContentWidth, setMainContentWidth] = useState(0);
  const gridLayout = useMemo(
    () => getCulledAlbumGridLayout(mainContentWidth, isMobileLayout),
    [isMobileLayout, mainContentWidth],
  );
  const { cardWidth, columnCount, gap, itemHeight, rowHeight } = gridLayout;

  const screenRootRef = useRef<View>(null);

  const syncScreenOrigin = useCallback(() => {
    screenRootRef.current?.measureInWindow((x, y) => {
      setScreenOrigin({ x, y });
    });
  }, []);

  const handleKeyFaceTooltipChange = useCallback(
    (anchor: KeyFaceTooltipAnchor | null) => {
      setKeyFaceTooltipWidth(0);
      setKeyFaceTooltip(anchor);
      if (anchor) {
        syncScreenOrigin();
      }
    },
    [syncScreenOrigin],
  );

  const photoMap = useMemo(() => {
    const map = new Map<string, APIResponse.CullingPhoto>();
    for (const photo of analyzedPhotos) {
      map.set(photo.photoId, photo);
    }
    for (const photo of albumPhotos) {
      if (photo.analysisStatus === 'analyzed') {
        map.set(photo.photoId, toCullingPhoto(photo));
      }
    }
    return map;
  }, [albumPhotos, analyzedPhotos]);

  const gridPhotos = useMemo(() => {
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

  const gridFilters = useMemo(
    () => ({
      selection: selectionFilter,
      starRating: starRatingFilter,
    }),
    [selectionFilter, starRatingFilter],
  );

  const filteredPhotos = useMemo(() => {
    const enabledCullFilters = Object.entries(activeFilters).filter(
      ([, enabled]) => enabled,
    ) as Array<[FilterKey, boolean]>;
    const hasGridFilters =
      selectionFilter !== null || starRatingFilter.length > 0;

    return gridPhotos.filter(({ analysis }) => {
      if (
        hasGridFilters &&
        !matchesCulledAlbumGridFilters(analysis, gridFilters)
      ) {
        return false;
      }
      if (enabledCullFilters.length === 0) {
        return true;
      }
      if (!analysis) {
        return false;
      }
      return enabledCullFilters.some(([key]) => analysis[key]);
    });
  }, [
    activeFilters,
    gridFilters,
    gridPhotos,
    selectionFilter,
    starRatingFilter,
  ]);

  const filesByPhotoId = useMemo(() => {
    const map = new Map<string, (typeof gridPhotos)[number]['file']>();
    for (const { photoId, file } of gridPhotos) {
      map.set(photoId, file);
    }
    return map;
  }, [gridPhotos]);

  const analyzedPhotoList = useMemo(
    () => Array.from(photoMap.values()),
    [photoMap],
  );

  const analyzedPhotoCount = useMemo(
    () =>
      albumPhotos.filter(photo => photo.analysisStatus === 'analyzed').length,
    [albumPhotos],
  );

  const refreshDetail = useCallback(async () => {
    try {
      const keyFaceList = await cullingEngine.getKeyFaces(albumId);
      const [photoList, statsResult] = await Promise.all([
        cullingEngine.getPhotos(albumId),
        cullingEngine.getStats(albumId),
      ]);
      setAnalyzedPhotos(photoList.results);
      setStats(statsResult);
      setKeyFaces(keyFaceList.results);
    } catch (error) {
      console.error(
        '[CulledAlbumDetailScreen] Failed to refresh detail',
        error,
      );
    } finally {
      setLoadingDetail(false);
    }
  }, [albumId]);

  useEffect(() => {
    if (!isAnalyzing && analyzedPhotoCount > 0) {
      refreshDetail();
    }
  }, [analyzedPhotoCount, isAnalyzing, refreshDetail]);

  const toggleSelection = useCallback(
    async (photoId: string, selected: boolean) => {
      const updated = await cullingEngine.updateSelection(albumId, photoId, {
        selected,
      });
      setAnalyzedPhotos(current =>
        current.map(photo =>
          photo.photoId === photoId ? { ...photo, ...updated } : photo,
        ),
      );
      setStats(await cullingEngine.getStats(albumId));
    },
    [albumId],
  );

  const updateStarRating = useCallback(
    async (photoId: string, starIndex: number, currentRating: number) => {
      const targetRating = starIndex + 1;
      const nextRating = currentRating === targetRating ? 0 : targetRating;
      const updated = await cullingEngine.updateStarRating(
        albumId,
        photoId,
        nextRating,
      );
      setAnalyzedPhotos(current =>
        current.map(photo =>
          photo.photoId === photoId ? { ...photo, ...updated } : photo,
        ),
      );
    },
    [albumId],
  );

  const handlePhotoHoverIn = useCallback((photoId: string) => {
    setHoveredPhotoId(photoId);
  }, []);

  const handlePhotoHoverOut = useCallback((photoId: string) => {
    setHoveredPhotoId(current => (current === photoId ? null : current));
  }, []);

  const handleOpenPhotoDetail = useCallback(
    (photoId: string) => {
      navigation.navigate('CulledAlbumPhotoDetail', { albumId, photoId });
    },
    [albumId, navigation],
  );

  const handleDeletePhotoPress = useCallback(
    (photoId: string, fileName: string) => {
      setPhotoToDelete({ photoId, fileName });
    },
    [],
  );

  async function handleDeletePhoto() {
    if (!photoToDelete) {
      return;
    }

    await cullingEngine.deletePhoto(albumId, photoToDelete.photoId);
    setAnalyzedPhotos(current =>
      current.filter(photo => photo.photoId !== photoToDelete.photoId),
    );
    setHoveredPhotoId(current =>
      current === photoToDelete.photoId ? null : current,
    );
    await refreshDetail();
  }

  async function handleStartUpload() {
    try {
      const { selectedPhotoIds } = await cullingEngine.finalize(albumId);
      if (selectedPhotoIds.length === 0) {
        return;
      }
      await startSelectedUpload(albumId, selectedPhotoIds);
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
  }

  function toggleFilter(key: FilterKey) {
    setActiveFilters(current => ({ ...current, [key]: !current[key] }));
  }

  const selectedCount =
    stats?.mySelections ??
    gridPhotos.filter(photo => photo.analysis?.selected).length;

  const sidebar = (
    <View style={[styles.sidebar, isMobileLayout && styles.sidebarMobile]}>
      <Accordion
        title="Cull Filters"
        expanded={cullFiltersExpanded}
        onToggle={() => setCullFiltersExpanded(current => !current)}
      >
        <View style={styles.accordionContent}>
          <View style={styles.totalPhotosBadge}>
            <Text style={styles.totalPhotosLabel}>Total Photos</Text>
            <Text style={styles.totalPhotosValue}>
              {stats?.totalPhotos ?? photos.length}
            </Text>
          </View>
          <Pressable
            style={[
              styles.mySelectionsRow,
              selectionFilter === 'selected' && styles.mySelectionsRowSelected,
            ]}
            onPress={() =>
              setSelectionFilter(current =>
                current === 'selected' ? null : 'selected',
              )
            }
          >
            <IconCheckCircle width={20} height={20} color={colors.text} />
            <Text style={styles.mySelectionsLabel}>My Selections</Text>
            <Text style={styles.mySelectionsCount}>{selectedCount}</Text>
          </Pressable>
          <View style={styles.sidebarDivider} />
          <View style={styles.filterRowContainer}>
            {(Object.keys(FILTER_LABELS) as FilterKey[]).map(key => (
              <Checkbox
                key={key}
                checked={activeFilters[key]}
                onToggle={() => toggleFilter(key)}
                size={20}
                style={styles.filterRow}
                color={activeFilters[key] ? colors.accent : colors.text}
              >
                <Text style={styles.filterLabel}>{FILTER_LABELS[key]}</Text>
                <Text style={styles.filterCount}>
                  {stats?.[key] ??
                    gridPhotos.filter(photo => photo.analysis?.[key]).length}
                </Text>
              </Checkbox>
            ))}
          </View>
        </View>
      </Accordion>

      <Accordion
        title={`Key Faces (${keyFaces.length})`}
        expanded={keyFacesExpanded}
        onToggle={() => setKeyFacesExpanded(current => !current)}
        fill={!isMobileLayout}
        minContentHeight={isMobileLayout ? 120 : 200}
        style={styles.keyFacesAccordion}
      >
        <ScrollView
          horizontal={isMobileLayout}
          style={styles.keyFaceScroll}
          contentContainerStyle={[
            styles.keyFaceGrid,
            isMobileLayout && styles.keyFaceGridMobile,
          ]}
          showsVerticalScrollIndicator={!isMobileLayout}
          showsHorizontalScrollIndicator={isMobileLayout}
        >
          {keyFaces.map(face => {
            const source = resolveKeyFaceSource(
              face,
              analyzedPhotoList,
              filesByPhotoId,
            );

            return (
              <KeyFaceSidebarItem
                key={face.faceId}
                uri={source?.uri}
                boundingBox={source?.boundingBox}
                eyeStatus={face.eyeStatus}
                focusLevel={face.focusLevel}
                width={64}
                onTooltipAnchorChange={handleKeyFaceTooltipChange}
              />
            );
          })}
        </ScrollView>
      </Accordion>
    </View>
  );

  const photoGrid =
    loadingPhotos || loadingDetail || cardWidth <= 0 ? (
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
        hoveredPhotoId={hoveredPhotoId}
        contentContainerStyle={[
          styles.grid,
          isMobileLayout && styles.gridMobile,
        ]}
        onHoverIn={handlePhotoHoverIn}
        onHoverOut={handlePhotoHoverOut}
        onOpenDetail={handleOpenPhotoDetail}
        onToggleSelection={toggleSelection}
        onDeletePress={handleDeletePhotoPress}
        onStarPress={updateStarRating}
      />
    );

  return (
    <SafeAreaView style={styles.container}>
      <View
        ref={screenRootRef}
        style={styles.screenRoot}
        onLayout={syncScreenOrigin}
      >
        <View
          style={[
            styles.header,
            {paddingHorizontal: screenPaddingHorizontal},
            isMobileLayout && styles.headerMobile,
          ]}>
          <GumpLogo width={112} height={40} />
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <IconChevronLeft width={24} height={24} color={colors.accent} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>

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
          {isMobileLayout && sidebar}
          <View
            style={styles.mainColumn}
            onLayout={event =>
              setMainContentWidth(event.nativeEvent.layout.width)
            }>
            {photoGrid}
          </View>
          {!isMobileLayout && sidebar}
        </View>

        <UploadToast mode="analyze" />

        {keyFaceTooltip && (
          <View
            pointerEvents="none"
            style={[
              styles.keyFaceTooltipHost,
              {
                top: keyFaceTooltip.bottomY - screenOrigin.y + 6,
                left: keyFaceTooltip.centerX - screenOrigin.x,
                transform: [{ translateX: -keyFaceTooltipWidth / 2 }],
                opacity: keyFaceTooltipWidth > 0 ? 1 : 0,
              },
            ]}
            onLayout={event =>
              setKeyFaceTooltipWidth(event.nativeEvent.layout.width)
            }
          >
            <FaceStatusTooltip
              eyeMeta={keyFaceTooltip.eyeMeta}
              focusMeta={keyFaceTooltip.focusMeta}
            />
          </View>
        )}

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  screenRoot: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 24,
    gap: 24,
  },
  headerMobile: {
    paddingTop: 16,
    gap: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: {
    fontFamily: fonts.sansBold,
    fontSize: 20,
    color: colors.accent,
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
  sidebar: {
    width: 246,
    flexDirection: 'column',
    gap: 20,
    minHeight: 0,
    paddingVertical: 24,
  },
  sidebarMobile: {
    width: '100%',
    paddingVertical: 12,
    flex: undefined,
  },
  accordionContent: {
    gap: 16,
  },
  totalPhotosBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackgroundSecondary,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  totalPhotosLabel: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.text,
  },
  totalPhotosValue: {
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.text,
  },
  mySelectionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    opacity: 0.2,
    paddingLeft: 12,
  },
  mySelectionsRowSelected: {
    opacity: 1,
  },
  mySelectionsLabel: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.text,
  },
  mySelectionsCount: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textMuted,
  },
  sidebarDivider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: 4,
  },
  filterRowContainer: {
    paddingLeft: 12,
    gap: 4,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  filterLabel: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.text,
  },
  filterCount: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textMuted,
  },

  keyFaceScroll: {
    flex: 1,
    overflow: 'visible',
  },
  keyFaceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingRight: 20,
    gap: 16,
  },
  keyFaceGridMobile: {
    flexWrap: 'nowrap',
    paddingRight: 0,
  },
  keyFacesAccordion: {
    overflow: 'visible',
  },
  keyFaceTooltipHost: {
    position: 'absolute',
    zIndex: 1000,
  },
});
