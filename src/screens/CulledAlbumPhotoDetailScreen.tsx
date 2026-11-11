import {FaceStatusTooltip, type KeyFaceTooltipAnchor} from '@components/culling/FaceStatusTooltip';
import {FacesInPhotoPanel} from '@components/culling/FacesInPhotoPanel';
import {PhotoDetailHeader} from '@components/culling/PhotoDetailHeader';
import {PhotoDetailImageViewer} from '@components/culling/PhotoDetailImageViewer';
import {PhotoDetailNavigationFrame} from '@components/culling/PhotoDetailNavigationFrame';
import {SimilarShotsStrip} from '@components/culling/SimilarShotsStrip';
import {UploadAwareModalShell} from '@components/navigation/UploadAwareModalShell';
import {useCulledAlbumPhoto} from '@context/culledAlbum';
import {useUploadAwareModalScreen} from '@hooks/useUploadAwareModalScreen';
import {usePhotoNavigation} from '@hooks/usePhotoNavigation';
import {toFacesPanelPhoto} from '@lib/culling/facesPanelPhoto';
import {cullingEngine} from '@lib/culling/cullingEngine';
import {useTogglePick} from '@hooks/useTogglePick';
import {reportError} from '@lib/observability/reportError';
import {toCullingPhoto, isCulledPhotoDisabled} from '@lib/culledAlbum/types';
import {colors} from '@lib/ui/colors';
import {fonts, sansBoldStyle} from '@lib/ui/typography';
import {
  ScrollAwareTooltipContext,
  createScrollAwareTooltipStore,
} from '@lib/ui/scrollAwareTooltip';
import {MainStackParamList} from '../app/MainNavigator';
import {StackScreenProps} from '@react-navigation/stack';
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useLayout} from '@hooks/useLayout';
import {useImageDimensions} from '@hooks/useImageDimensions';
import {preloadImage} from '@lib/media/imagePreload';
import {
  ensureLookDetail,
  isLookDetailCurrent,
} from '@lib/look/bakeLook';
import {hasAppliedLook} from '@lib/look/types';
import {
  ensureDetail,
  isUsableDetailUri,
  resolveDetailDisplayUri,
} from '@lib/storage/localStorage';
import {getPhotoById, updatePhoto} from '@lib/culledAlbum/store';
import {syncPhotoFromStore} from '@/application/syncPhotoRepository';
import {TouchableOpacity} from '@components/ui';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

type Props = StackScreenProps<MainStackParamList, 'CulledAlbumPhotoDetail'>;

export default function CulledAlbumPhotoDetailScreen({
  navigation,
  route,
}: Props) {
  const {
    albumId,
    photoId,
    faceIndex: initialFaceIndex,
    photoIds: navigationPhotoIds = [],
  } = route.params;
  const {shellProps, handleBack} = useUploadAwareModalScreen(
    navigation,
    route.params.instant,
    {albumId},
  );
  const {isMobileLayout, isDesktopPlatform, screenPaddingHorizontal} =
    useLayout();
  // Live per-photo subscription (same path as CulledAlbumPhotoCard) so star /
  // selection edits from the album grid stay in sync after in-place store updates.
  const photo = useCulledAlbumPhoto(albumId, photoId);
  const analysis =
    photo?.analysisStatus === 'analyzed' ? toCullingPhoto(photo) : null;
  const [zoomFaceIndex, setZoomFaceIndex] = useState<number | null>(() =>
    typeof initialFaceIndex === 'number' ? initialFaceIndex : null,
  );
  const [tooltip, setTooltip] = useState<KeyFaceTooltipAnchor | null>(null);
  const [tooltipWidth, setTooltipWidth] = useState(0);
  const [tooltipHeight, setTooltipHeight] = useState(0);
  const [screenOrigin, setScreenOrigin] = useState({x: 0, y: 0});

  const screenRootRef = useRef<View>(null);
  const appliedInitialFaceIndexRef = useRef(false);

  const syncScreenOrigin = useCallback(() => {
    screenRootRef.current?.measureInWindow((x, y) => {
      setScreenOrigin({x, y});
    });
  }, []);

  const handleTooltipChange = useCallback(
    (anchor: KeyFaceTooltipAnchor | null) => {
      setTooltipWidth(0);
      setTooltipHeight(0);
      setTooltip(anchor);
      if (anchor) {
        syncScreenOrigin();
      }
    },
    [syncScreenOrigin],
  );

  const scrollStoreRef = useRef(createScrollAwareTooltipStore());
  const handleTooltipChangeRef = useRef(handleTooltipChange);
  handleTooltipChangeRef.current = handleTooltipChange;

  const handleFacePress = useCallback((index: number) => {
    setZoomFaceIndex(current => (current === index ? null : index));
  }, []);

  const faces = analysis?.faces ?? [];
  const fileName = photo?.file.name ?? 'Photo';

  useEffect(() => {
    if (appliedInitialFaceIndexRef.current) {
      return;
    }
    appliedInitialFaceIndexRef.current = true;
    if (typeof initialFaceIndex !== 'number') {
      return;
    }
    if (initialFaceIndex < 0 || initialFaceIndex >= faces.length) {
      setZoomFaceIndex(null);
      return;
    }
    setZoomFaceIndex(initialFaceIndex);
  }, [faces.length, initialFaceIndex]);

  const [uri, setUri] = useState(() => {
    if (!photo) {
      return '';
    }
    if (hasAppliedLook(photo.lookId)) {
      return isLookDetailCurrent(photo.file, photo.lookId)
        ? photo.file.lookDetailUri!
        : '';
    }
    return resolveDetailDisplayUri(photo.file);
  });
  const imageSize = useImageDimensions(uri);
  const photoFileUri = photo?.file.uri;
  const photoThumbnailUri = photo?.file.thumbnailUri;
  const photoDetailUri = photo?.file.detailUri;
  const photoLookDetailUri = photo?.file.lookDetailUri;
  const photoLookDetailKey = photo?.file.lookDetailKey;
  const photoLookId = photo?.lookId;
  const lookApplied = hasAppliedLook(photoLookId);
  const lookDetailReady =
    lookApplied &&
    photoLookId != null &&
    isLookDetailCurrent(
      {
        lookDetailUri: photoLookDetailUri,
        lookDetailKey: photoLookDetailKey,
      },
      photoLookId,
    );

  // Layout phase so uri and photoId stay in sync before paint. A deferred
  // useEffect left Windows Image one frame on the previous uri, and its
  // native Image often never swapped after that.
  useLayoutEffect(() => {
    if (!photoFileUri) {
      setUri('');
      return;
    }

    if (lookApplied) {
      // Hold gray until look-baked detail is ready — never flash ungraded.
      setUri(lookDetailReady && photoLookDetailUri ? photoLookDetailUri : '');
      return;
    }

    const displayFile = {
      uri: photoFileUri,
      name: photo?.file.name ?? '',
      size: photo?.file.size ?? 0,
      type: photo?.file.type ?? '',
      thumbnailUri: photoThumbnailUri,
      detailUri: photoDetailUri,
    };
    setUri(resolveDetailDisplayUri(displayFile));
  }, [
    albumId,
    lookApplied,
    lookDetailReady,
    photo?.file.name,
    photo?.file.size,
    photo?.file.type,
    photoDetailUri,
    photoFileUri,
    photoId,
    photoLookDetailUri,
    photoThumbnailUri,
  ]);

  useEffect(() => {
    if (!lookApplied || lookDetailReady || !photo) {
      return;
    }

    let cancelled = false;
    ensureLookDetail(photo)
      .then(async result => {
        if (cancelled || !result.lookDetailUri || !result.lookDetailKey) {
          return;
        }
        const lookDetailUri = result.lookDetailUri;
        const lookDetailKey = result.lookDetailKey;
        await preloadImage(lookDetailUri);
        if (cancelled) {
          return;
        }
        updatePhoto(albumId, photoId, current => {
          current.file = {...current.file, lookDetailUri, lookDetailKey};
        });
        syncPhotoFromStore(albumId, photoId);
        setUri(lookDetailUri);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [
    albumId,
    lookApplied,
    lookDetailReady,
    photo,
    photoId,
    photoLookId,
  ]);

  useEffect(() => {
    // Ungraded detail derivative only when no look is applied.
    if (lookApplied || !photoFileUri || isUsableDetailUri(photoDetailUri)) {
      return;
    }

    let cancelled = false;
    const sourceFile = {
      uri: photoFileUri,
      name: photo?.file.name ?? '',
      size: photo?.file.size ?? 0,
      type: photo?.file.type ?? '',
      thumbnailUri: photoThumbnailUri,
      detailUri: photoDetailUri,
    };

    ensureDetail(albumId, sourceFile, photoId)
      .then(async nextFile => {
        if (cancelled || !isUsableDetailUri(nextFile.detailUri)) {
          return;
        }
        const detailUri = nextFile.detailUri!;
        // Swap only once the upgrade is decodable, so the visible frame is
        // replaced in one step instead of going through an empty load.
        await preloadImage(detailUri);
        if (cancelled) {
          return;
        }
        updatePhoto(albumId, photoId, current => {
          current.file = {...current.file, detailUri};
        });
        syncPhotoFromStore(albumId, photoId);
        setUri(detailUri);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [
    albumId,
    lookApplied,
    photo?.file.name,
    photo?.file.size,
    photo?.file.type,
    photoDetailUri,
    photoFileUri,
    photoId,
    photoThumbnailUri,
  ]);

  useLayoutEffect(() => {
    if (uri) {
      preloadImage(uri).catch(() => undefined);
    }
  }, [uri]);

  const isSelected = analysis?.selected ?? false;
  const starRating = analysis?.starRating ?? 0;
  const disabled = photo ? isCulledPhotoDisabled(photo) : false;

  async function toggleSelection() {
    if (!analysis || disabled) {
      return;
    }

    await toggleMemberSelection(photoId, !analysis.selected).catch(err =>
      reportError(err, {source: 'photo_detail', operation: 'toggle_pick'}),
    );
  }

  const toggleMemberSelection = useTogglePick(albumId);

  async function updateStarRating(starIndex: number) {
    if (!analysis || disabled) {
      return;
    }

    const targetRating = starIndex + 1;
    const nextRating = starRating === targetRating ? 0 : targetRating;
    await cullingEngine.updateStarRating(albumId, photoId, nextRating);
  }

  const {prevId, nextId} = usePhotoNavigation(navigationPhotoIds, photoId);
  const canGoPrev = prevId !== undefined;
  const canGoNext = nextId !== undefined;

  const goToPhoto = useCallback(
    (targetPhotoId: string | undefined) => {
      if (!targetPhotoId || targetPhotoId === photoId) {
        return;
      }

      const file = getPhotoById(albumId, targetPhotoId)?.file;
      if (file) {
        preloadImage(resolveDetailDisplayUri(file)).catch(() => undefined);
      }

      setZoomFaceIndex(null);
      navigation.setParams({photoId: targetPhotoId, faceIndex: undefined});
    },
    [albumId, navigation, photoId],
  );

  const goToPreviousPhoto = useCallback(() => {
    goToPhoto(prevId);
  }, [goToPhoto, prevId]);

  const goToNextPhoto = useCallback(() => {
    goToPhoto(nextId);
  }, [goToPhoto, nextId]);

  const facesPanelPhoto = useMemo(
    () => (photo ? toFacesPanelPhoto(photo) : null),
    [photo],
  );

  if (!photo || !analysis) {
    return (
      <UploadAwareModalShell {...shellProps}>
        <SafeAreaView style={styles.container}>
          <View style={styles.missingState}>
            <Text style={styles.missingStateText}>Photo not found.</Text>
            <TouchableOpacity onPress={handleBack}>
              <Text style={styles.backLink}>Go back</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </UploadAwareModalShell>
    );
  }

  return (
    <UploadAwareModalShell {...shellProps}>
      <SafeAreaView style={styles.container}>
        <View
          ref={screenRootRef}
          style={styles.screenRoot}
          onLayout={syncScreenOrigin}
        >
          <PhotoDetailHeader
            fileName={fileName}
            starRating={starRating}
            picked={isSelected}
            disabled={disabled}
            isMobileLayout={isMobileLayout}
            paddingHorizontal={screenPaddingHorizontal}
            onRate={updateStarRating}
            onTogglePick={toggleSelection}
            onClose={handleBack}
          />

          <ScrollAwareTooltipContext.Provider value={scrollStoreRef.current}>
            <View
              style={[
                styles.content,
                {paddingHorizontal: screenPaddingHorizontal},
                isMobileLayout && styles.contentMobile,
              ]}>
              <View
                style={[
                  styles.mainColumn,
                  isMobileLayout && styles.mainColumnMobile,
                ]}>
                <PhotoDetailNavigationFrame
                  canGoPrev={canGoPrev}
                  canGoNext={canGoNext}
                  onPrev={goToPreviousPhoto}
                  onNext={goToNextPhoto}
                  showHoverChevrons={isDesktopPlatform && !isMobileLayout}
                >
                  <PhotoDetailImageViewer
                    uri={uri}
                    photoId={photoId}
                    faces={faces}
                    zoomFaceIndex={zoomFaceIndex}
                    lookId={lookDetailReady ? 'original' : photo?.lookId}
                    imageSize={imageSize}
                    onTooltipAnchorChange={handleTooltipChange}
                  />
                </PhotoDetailNavigationFrame>
                <SimilarShotsStrip
                  albumId={albumId}
                  photoId={photoId}
                  onOpenPhoto={goToPhoto}
                  onToggleSelection={toggleMemberSelection}
                />
              </View>

              <View
                style={[
                  styles.sidebar,
                  isMobileLayout && styles.sidebarMobile,
                ]}>
                <ScrollView>
                  <FacesInPhotoPanel
                    photo={facesPanelPhoto}
                    variant="viewer"
                    selectedIndex={zoomFaceIndex}
                    onFacePress={handleFacePress}
                  />
                </ScrollView>
              </View>
            </View>
          </ScrollAwareTooltipContext.Provider>

          {tooltip && (
            <View
              pointerEvents="none"
              style={[
                styles.tooltipHost,
                {
                  top:
                    tooltip.placement === 'above'
                      ? (tooltip.topY ?? tooltip.bottomY) - screenOrigin.y - 6
                      : tooltip.bottomY - screenOrigin.y + 6,
                  left: tooltip.centerX - screenOrigin.x,
                  transform:
                    tooltip.placement === 'above'
                      ? [
                          {translateX: -tooltipWidth / 2},
                          {translateY: -tooltipHeight},
                        ]
                      : [{translateX: -tooltipWidth / 2}],
                  opacity:
                    tooltipWidth > 0 &&
                    (tooltip.placement !== 'above' || tooltipHeight > 0)
                      ? 1
                      : 0,
                },
              ]}
              onLayout={event => {
                setTooltipWidth(event.nativeEvent.layout.width);
                setTooltipHeight(event.nativeEvent.layout.height);
              }}
            >
              <FaceStatusTooltip
                backgroundColor={tooltip.backgroundColor}
                eyeMeta={tooltip.eyeMeta}
                focusMeta={tooltip.focusMeta}
                placement={tooltip.placement}
              />
            </View>
          )}
        </View>
      </SafeAreaView>
    </UploadAwareModalShell>
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
  content: {
    flex: 1,
    flexDirection: 'row',
    gap: 42,
    paddingBottom: 24,
    minHeight: 0,
  },
  contentMobile: {
    flexDirection: 'column',
    gap: 16,
  },
  mainColumn: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: 'hidden',
  },
  mainColumnMobile: {
    width: '100%',
    minHeight: 280,
  },
  sidebar: {
    width: 328,
    minHeight: 0,
    zIndex: 2,
  },
  sidebarMobile: {
    flex: undefined,
    width: '100%',
    minHeight: undefined,
  },
  tooltipHost: {
    position: 'absolute',
    zIndex: 1000,
  },
  missingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  missingStateText: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.textMuted,
  },
  backLink: {
    ...sansBoldStyle,
    fontSize: 14,
    color: colors.accent,
  },
});
