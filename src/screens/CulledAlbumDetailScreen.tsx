import { CulledAlbumFilterBar } from '@components/culling/CulledAlbumFilterBar';
import { DeletePhotoModal } from '@components/modals/DeletePhotoModal';
import { UploadToast } from '@components/upload/UploadToast';
import {
  FaceStatusTooltip,
  KeyFaceSidebarItem,
  type KeyFaceTooltipAnchor,
} from '@components/culling/KeyFaceSidebarItem';
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
import { toCullingPhoto } from '@lib/culledAlbum/types';
import { colors } from '@lib/colors';
import { fonts } from '@lib/typography';
import { MainStackParamList } from '../app/MainNavigator';
import { APIResponse } from '@services/api';
import { StackScreenProps } from '@react-navigation/stack';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IconCheckCircle from '../assets/images/icon_check_circle.svg';
import IconCheckCircleOutlined from '../assets/images/icon_check_circle_outlined.svg';
import IconChevronLeft from '../assets/images/icon_chevron_left.svg';
import IconNoPhoto from '../assets/images/icon_no_photo.svg';
import IconStar from '../assets/images/icon_star.svg';
import IconStarOutlined from '../assets/images/icon_star_outlined.svg';
import IconTrash from '../assets/images/icon_trash.svg';
import GumpLogo from '../assets/images/logo.svg';
import { Checkbox } from '@components/ui/Checkbox';

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

  const { photos, loadingPhotos, loadError } = useCulledAlbumPhotos(albumId);
  const albumPhotos = useCulledAlbumPhotosState(albumId);
  const cullingCompleted = useCulledAlbumStore(
    state => state.albums[albumId]?.cullingCompleted ?? false,
  );
  const cullingHasUploads = useCulledAlbumStore(
    state => state.albums[albumId]?.cullingHasUploads ?? false,
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

  const [mainContentWidth, setMainContentWidth] = useState(0);
  const cardWidth = useMemo(() => {
    if (mainContentWidth <= 0) {
      return 0;
    }

    const minWidth = 320;
    const gap = 16;
    const columns = Math.max(1, Math.floor(mainContentWidth / minWidth));
    const paddingRight = 24;

    return (mainContentWidth - gap * (columns - 1)) / columns - paddingRight;
  }, [mainContentWidth]);

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
        analysis:
          photo.analysisStatus === 'analyzed'
            ? toCullingPhoto(photo)
            : photoMap.get(photo.photoId),
      }));
  }, [albumPhotos, photoMap]);

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
      return enabledCullFilters.every(([key]) => analysis[key]);
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

  async function toggleSelection(photoId: string, selected: boolean) {
    const updated = await cullingEngine.updateSelection(albumId, photoId, {
      selected,
    });
    setAnalyzedPhotos(current =>
      current.map(photo =>
        photo.photoId === photoId ? { ...photo, ...updated } : photo,
      ),
    );
    setStats(await cullingEngine.getStats(albumId));
  }

  async function updateStarRating(
    photoId: string,
    starIndex: number,
    currentRating: number,
  ) {
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
  }

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

  async function handleUploadSelected() {
    // TODO: Add finalizing state
    try {
      const { selectedPhotoIds } = await cullingEngine.finalize(albumId);
      if (selectedPhotoIds.length === 0) {
        return;
      }
      await startSelectedUpload(albumId, selectedPhotoIds);
      navigation.navigate('Home');
    } catch (error) {
      console.error(
        '[CulledAlbumDetailScreen] Failed to upload selected',
        error,
      );
    }
  }

  function toggleFilter(key: FilterKey) {
    setActiveFilters(current => ({ ...current, [key]: !current[key] }));
  }

  const selectedCount =
    stats?.mySelections ??
    gridPhotos.filter(photo => photo.analysis?.selected).length;

  return (
    <SafeAreaView style={styles.container}>
      <View
        ref={screenRootRef}
        style={styles.screenRoot}
        onLayout={syncScreenOrigin}
      >
        <View style={styles.header}>
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

        <View style={styles.filterBarRow}>
          <CulledAlbumFilterBar
            selectionFilter={selectionFilter}
            starRatingFilter={starRatingFilter}
            onSelectionFilterChange={setSelectionFilter}
            onStarRatingFilterChange={setStarRatingFilter}
            onUploadSelected={handleUploadSelected}
            uploaded={cullingHasUploads}
            uploadDisabled={selectedCount === 0}
          />
        </View>

        <View style={styles.content}>
          <View
            style={styles.mainColumn}
            onLayout={event =>
              setMainContentWidth(event.nativeEvent.layout.width)
            }
          >
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
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.grid}
              >
                {filteredPhotos.map(({ file, photoId, analysis }) => {
                  const isSelected = analysis?.selected ?? false;
                  const isHovered = hoveredPhotoId === photoId;

                  return (
                    <Pressable
                      key={photoId}
                      style={[styles.photoCard, { width: cardWidth }]}
                      onHoverIn={() => setHoveredPhotoId(photoId)}
                      onHoverOut={() =>
                        setHoveredPhotoId(current =>
                          current === photoId ? null : current,
                        )
                      }
                      onPress={() =>
                        analysis && toggleSelection(photoId, !analysis.selected)
                      }
                    >
                      <View style={styles.thumbnailWrapper}>
                        <Image
                          source={{ uri: file.uri }}
                          style={[styles.thumbnail, { width: cardWidth }]}
                          resizeMode="cover"
                        />
                        {canDeletePhoto && isHovered && (
                          <Pressable
                            style={styles.deletePhotoButton}
                            onPress={event => {
                              event.stopPropagation();
                              setPhotoToDelete({
                                photoId,
                                fileName: file.name,
                              });
                            }}
                            accessibilityRole="button"
                            accessibilityLabel={`Delete ${file.name}`}
                          >
                            <IconTrash
                              width={24}
                              height={24}
                              color={colors.text}
                            />
                          </Pressable>
                        )}
                      </View>
                      <View style={styles.photoInfoContainer}>
                        <Text style={styles.fileName} numberOfLines={1}>
                          {file.name}
                        </Text>

                        <View style={styles.otherInfoContainer}>
                          <View style={styles.starRatingContainer}>
                            {[...Array(5)].map((_, i) => {
                              const currentRating = analysis?.starRating ?? 0;
                              const filled = currentRating > i;
                              const Icon = filled ? IconStar : IconStarOutlined;
                              return (
                                <Pressable
                                  key={i}
                                  onPress={event => {
                                    event.stopPropagation();
                                    if (analysis) {
                                      updateStarRating(
                                        photoId,
                                        i,
                                        currentRating,
                                      );
                                    }
                                  }}
                                  style={styles.starButton}
                                  accessibilityRole="button"
                                  accessibilityLabel={`Rate ${i + 1} stars`}
                                  accessibilityState={{
                                    selected: currentRating === i + 1,
                                  }}
                                >
                                  <Icon
                                    width={16}
                                    height={16}
                                    color={colors.accent}
                                  />
                                </Pressable>
                              );
                            })}
                          </View>

                          <Pressable
                            onPress={() =>
                              analysis
                                ? toggleSelection(photoId, !analysis.selected)
                                : {}
                            }
                            style={styles.selectionButton}
                            accessibilityRole="button"
                            accessibilityState={{ selected: isSelected }}
                          >
                            {isSelected ? (
                              <IconCheckCircle
                                width={16}
                                height={16}
                                color={colors.text}
                              />
                            ) : (
                              <IconCheckCircleOutlined
                                width={16}
                                height={16}
                                color={colors.text}
                              />
                            )}
                          </Pressable>
                        </View>
                      </View>
                      {/* <Checkbox
                        checked={isSelected}
                        onToggle={() =>
                          analysis &&
                          toggleSelection(photoId, !analysis.selected)
                        }
                        size={20}
                        color={isSelected ? colors.accent : colors.text}
                      /> */}
                      {/* <Text style={styles.fileName} numberOfLines={1}>
                        {file.name}
                      </Text>
                      <Text style={styles.starRating}>
                        {'★'.repeat(Math.max(0, analysis?.starRating ?? 0))}
                        {'☆'.repeat(
                          5 -
                            Math.max(0, Math.min(5, analysis?.starRating ?? 0)),
                        )}
                      </Text> */}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>

          <View style={styles.sidebar}>
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
                    selectionFilter === 'selected' &&
                      styles.mySelectionsRowSelected,
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
                      <Text style={styles.filterLabel}>
                        {FILTER_LABELS[key]}
                      </Text>
                      <Text style={styles.filterCount}>
                        {stats?.[key] ??
                          gridPhotos.filter(photo => photo.analysis?.[key])
                            .length}
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
              fill
              minContentHeight={200}
              style={styles.keyFacesAccordion}
            >
              <ScrollView
                style={styles.keyFaceScroll}
                contentContainerStyle={styles.keyFaceGrid}
                showsVerticalScrollIndicator
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
    paddingHorizontal: 48,
    paddingTop: 40,
    paddingBottom: 24,
    gap: 24,
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
  filterBarRow: {
    paddingHorizontal: 48,
  },

  content: {
    flex: 1,
    flexDirection: 'row',
    gap: 24,
    paddingHorizontal: 48,
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
  scroll: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingVertical: 24,
    paddingRight: 24,
  },
  photoCard: {
    gap: 8,
  },
  thumbnailWrapper: {
    position: 'relative',
  },
  thumbnail: {
    aspectRatio: 4 / 3,
    backgroundColor: colors.cardBackgroundSecondary,
  },
  deletePhotoButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 36,
    backgroundColor: colors.background + '66',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  photoInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingLeft: 2,
  },
  fileName: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.text,
  },
  otherInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  starRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  starButton: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    userSelect: 'none',
  },
  starRating: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.accent,
  },
  selectionButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    userSelect: 'none',
  },

  sidebar: {
    width: 246,
    flexDirection: 'column',
    gap: 20,
    minHeight: 0,
    paddingVertical: 24,
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
    cursor: 'pointer',
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
  keyFacesAccordion: {
    overflow: 'visible',
  },
  keyFaceTooltipHost: {
    position: 'absolute',
    zIndex: 1000,
  },
});
