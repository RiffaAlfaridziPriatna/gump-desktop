import {FaceStatusTooltip, type KeyFaceTooltipAnchor} from '@components/culling/FaceStatusTooltip';
import {KeyFaceSidebarItem} from '@components/culling/KeyFaceSidebarItem';
import {PhotoDetailImageViewer} from '@components/culling/PhotoDetailImageViewer';
import {UploadAwareModalShell} from '@components/navigation/UploadAwareModalShell';
import {useCulledAlbumPhotosState, useCulledAlbumStore} from '@context/culledAlbum';
import {useUploadAwareModalScreen} from '@hooks/useUploadAwareModalScreen';
import {cullingEngine} from '@lib/culling/cullingEngine';
import {toCullingPhoto, isCulledPhotoDisabled} from '@lib/culledAlbum/types';
import {colors} from '@lib/ui/colors';
import {fonts, sansBoldStyle} from '@lib/ui/typography';
import {
  ScrollAwareTooltipContext,
  createScrollAwareTooltipStore,
  useScrollAwareTooltipHandlers,
} from '@lib/ui/scrollAwareTooltip';
import {MainStackParamList} from '../app/MainNavigator';
import {StackScreenProps} from '@react-navigation/stack';
import {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useLayout} from '@hooks/useLayout';
import {useImageDimensions} from '@hooks/useImageDimensions';
import {preloadImage} from '@lib/media/imagePreload';
import {resolveDetailDisplayUri, ensureThumbnail} from '@lib/storage/localStorage';
import {Pressable, TouchableOpacity} from '@components/ui';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconCheckCircle from '../assets/images/icon_check_circle.svg';
import IconCheckCircleOutlined from '../assets/images/icon_check_circle_outlined.svg';
import IconClose from '../assets/images/icon_close.svg';
import IconStar from '../assets/images/icon_star.svg';
import IconStarOutlined from '../assets/images/icon_star_outlined.svg';

type Props = StackScreenProps<MainStackParamList, 'CulledAlbumPhotoDetail'>;

const KEY_FACE_ITEM_SIZE = 64;
const KEY_FACE_COLUMN_COUNT = 4;
const KEY_FACE_GAP = 24;
const KEY_FACE_SIDEBAR_WIDTH =
  KEY_FACE_COLUMN_COUNT * KEY_FACE_ITEM_SIZE +
  (KEY_FACE_COLUMN_COUNT - 1) * KEY_FACE_GAP;

export default function CulledAlbumPhotoDetailScreen({
  navigation,
  route,
}: Props) {
  const {albumId, photoId} = route.params;
  const {shellProps, handleBack} = useUploadAwareModalScreen(
    navigation,
    route.params.instant,
    {albumId},
  );
  const {isMobileLayout, screenPaddingHorizontal} = useLayout();
  const albumPhotos = useCulledAlbumPhotosState(albumId);
  const cullingHasUploads = useCulledAlbumStore(
    state => state.albums[albumId]?.cullingHasUploads ?? false,
  );
  const photo = useMemo(
    () => albumPhotos.find(entry => entry.photoId === photoId),
    [albumPhotos, photoId],
  );

  const [analysis, setAnalysis] = useState(() =>
    photo ? toCullingPhoto(photo) : null,
  );

  useEffect(() => {
    if (photo) {
      setAnalysis(toCullingPhoto(photo));
    }
  }, [photo]);
  const [zoomFaceIndex, setZoomFaceIndex] = useState<number | null>(null);
  const [mainImageReady, setMainImageReady] = useState(false);
  const [tooltip, setTooltip] = useState<KeyFaceTooltipAnchor | null>(null);
  const [tooltipWidth, setTooltipWidth] = useState(0);
  const [screenOrigin, setScreenOrigin] = useState({x: 0, y: 0});

  const screenRootRef = useRef<View>(null);

  const syncScreenOrigin = useCallback(() => {
    screenRootRef.current?.measureInWindow((x, y) => {
      setScreenOrigin({x, y});
    });
  }, []);

  const handleTooltipChange = useCallback(
    (anchor: KeyFaceTooltipAnchor | null) => {
      setTooltipWidth(0);
      setTooltip(anchor);
      if (anchor) {
        syncScreenOrigin();
      }
    },
    [syncScreenOrigin],
  );

  const scrollStoreRef = useRef(createScrollAwareTooltipStore());
  const keyFaceScrollHandlers = useScrollAwareTooltipHandlers(
    scrollStoreRef.current,
    () => handleTooltipChange(null),
  );

  const faces = analysis?.faces ?? [];
  const fileName = photo?.file.name ?? 'Photo';
  const [uri, setUri] = useState(() =>
    photo ? resolveDetailDisplayUri(photo.file) : '',
  );
  const imageSize = useImageDimensions(uri);

  useEffect(() => {
    if (!photo) {
      setUri('');
      return;
    }

    if (Platform.OS !== 'windows') {
      setUri(resolveDetailDisplayUri(photo.file));
      return;
    }

    let cancelled = false;
    const fallbackUri = resolveDetailDisplayUri(photo.file);
    setUri(fallbackUri);

    ensureThumbnail(albumId, photo.file, photo.photoId).then(updated => {
      if (!cancelled) {
        setUri(resolveDetailDisplayUri(updated));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [albumId, photo]);

  useLayoutEffect(() => {
    setMainImageReady(false);
    if (uri) {
      preloadImage(uri).catch(() => undefined);
    }
  }, [uri]);

  const handleMainImageReady = useCallback(() => {
    setMainImageReady(true);
  }, []);
  const isSelected = analysis?.selected ?? false;
  const starRating = analysis?.starRating ?? 0;
  const disabled = photo ? isCulledPhotoDisabled(photo, cullingHasUploads) : false;

  async function toggleSelection() {
    if (!analysis || disabled) {
      return;
    }

    const updated = await cullingEngine.updateSelection(albumId, photoId, {
      selected: !analysis.selected,
    });
    setAnalysis(current => (current ? {...current, ...updated} : current));
  }

  async function updateStarRating(starIndex: number) {
    if (!analysis || disabled) {
      return;
    }

    const targetRating = starIndex + 1;
    const nextRating = starRating === targetRating ? 0 : targetRating;
    const updated = await cullingEngine.updateStarRating(
      albumId,
      photoId,
      nextRating,
    );
    setAnalysis(current => (current ? {...current, ...updated} : current));
  }

  const renderKeyFaceItem = useCallback(
    ({item: face, index}: {item: (typeof faces)[number]; index: number}) => (
      <KeyFaceSidebarItem
        uri={uri}
        boundingBox={face.boundingBox}
        eyeStatus={face.eyeStatus}
        focusLevel={face.focusLevel}
        width={KEY_FACE_ITEM_SIZE}
        imageSize={imageSize}
        selected={zoomFaceIndex === index}
        onPress={() =>
          setZoomFaceIndex(current => (current === index ? null : index))
        }
        onTooltipAnchorChange={handleTooltipChange}
      />
    ),
    [handleTooltipChange, imageSize, uri, zoomFaceIndex],
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
          <View
            style={[
              styles.header,
              {paddingHorizontal: screenPaddingHorizontal},
              isMobileLayout && styles.headerMobile,
            ]}>
            <View
              style={[
                styles.headerLeft,
                isMobileLayout && styles.headerLeftMobile,
              ]}>
              <Text style={styles.fileName} numberOfLines={1}>
                {fileName}
              </Text>

              <View style={styles.otherInfoContainer}>
                <View style={styles.starRatingContainer}>
                  {[...Array(5)].map((_, index) => {
                    const filled = starRating > index;
                    const Icon = filled ? IconStar : IconStarOutlined;

                    return (
                      <Pressable
                        key={index}
                        onPress={() => updateStarRating(index)}
                        style={[
                          styles.starButton,
                          disabled && styles.controlDisabled,
                        ]}
                        disabled={disabled}
                        accessibilityRole="button"
                        accessibilityLabel={`Rate ${index + 1} stars`}
                      >
                        <Icon width={24} height={24} color={colors.accent} />
                      </Pressable>
                    );
                  })}
                </View>

                <Pressable
                  onPress={toggleSelection}
                  style={[
                    styles.selectionButton,
                    disabled && styles.controlDisabled,
                  ]}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityState={{selected: isSelected}}
                >
                  {isSelected ? (
                    <IconCheckCircle width={24} height={24} color={colors.text} />
                  ) : (
                    <IconCheckCircleOutlined
                      width={24}
                      height={24}
                      color={colors.text}
                    />
                  )}
                </Pressable>
              </View>
            </View>

            <Pressable
              onPress={handleBack}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel="Close photo detail"
            >
              <IconClose width={32} height={32} color={colors.text} />
            </Pressable>
          </View>

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
                <PhotoDetailImageViewer
                  uri={uri}
                  faces={faces}
                  zoomFaceIndex={zoomFaceIndex}
                  imageSize={imageSize}
                  onImageReady={handleMainImageReady}
                  onTooltipAnchorChange={handleTooltipChange}
                />
              </View>

              <View
                style={[
                  styles.sidebar,
                  isMobileLayout && styles.sidebarMobile,
                ]}>
                <Text style={styles.sidebarTitle}>Key Faces ({faces.length})</Text>
                {mainImageReady && imageSize ? (
                  <FlatList
                    {...keyFaceScrollHandlers}
                    data={faces}
                    keyExtractor={(_, index) => `face-${index}`}
                    renderItem={renderKeyFaceItem}
                    horizontal={isMobileLayout}
                    numColumns={isMobileLayout ? undefined : KEY_FACE_COLUMN_COUNT}
                    columnWrapperStyle={
                      isMobileLayout ? undefined : styles.keyFaceRow
                    }
                    style={styles.keyFaceScroll}
                    contentContainerStyle={[
                      styles.keyFaceGrid,
                      isMobileLayout && styles.keyFaceGridMobile,
                    ]}
                    showsVerticalScrollIndicator={!isMobileLayout}
                    showsHorizontalScrollIndicator={isMobileLayout}
                    initialNumToRender={
                      isMobileLayout ? 6 : KEY_FACE_COLUMN_COUNT * 3
                    }
                    maxToRenderPerBatch={
                      isMobileLayout ? 6 : KEY_FACE_COLUMN_COUNT * 3
                    }
                    windowSize={3}
                    removeClippedSubviews={Platform.OS !== 'windows'}
                  />
                ) : (
                  <View style={styles.keyFaceLoading}>
                    <ActivityIndicator size="small" color={colors.accent} />
                  </View>
                )}
              </View>
            </View>
          </ScrollAwareTooltipContext.Provider>

          {tooltip && (
            <View
              pointerEvents="none"
              style={[
                styles.tooltipHost,
                {
                  top: tooltip.bottomY - screenOrigin.y + 6,
                  left: tooltip.centerX - screenOrigin.x,
                  transform: [{translateX: -tooltipWidth / 2}],
                  opacity: tooltipWidth > 0 ? 1 : 0,
                },
              ]}
              onLayout={event =>
                setTooltipWidth(event.nativeEvent.layout.width)
              }
            >
              <FaceStatusTooltip
                backgroundColor={tooltip.backgroundColor}
                eyeMeta={tooltip.eyeMeta}
                focusMeta={tooltip.focusMeta}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 40,
    paddingBottom: 24,
    gap: 16,
  },
  headerMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingTop: 16,
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    minWidth: 0,
  },
  headerLeftMobile: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 12,
    width: '100%',
  },
  fileName: {
    flexShrink: 1,
    fontFamily: fonts.sans,
    fontSize: 20,
    fontWeight: 600,
    color: colors.text,
  },
  otherInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  starRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  starButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlDisabled: {
    opacity: 0.5,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    gap: 24,
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
  },
  mainColumnMobile: {
    width: '100%',
    minHeight: 280,
  },
  sidebar: {
    width: KEY_FACE_SIDEBAR_WIDTH,
    minHeight: 0,
    gap: KEY_FACE_GAP,
  },
  sidebarMobile: {
    flex: undefined,
    width: '100%',
    minHeight: undefined,
    gap: 12,
  },
  sidebarTitle: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.text,
  },
  keyFaceScroll: {
    flex: 1,
    overflow: 'visible',
  },
  keyFaceGrid: {
    gap: KEY_FACE_GAP,
    overflow: 'visible',
  },
  keyFaceRow: {
    gap: KEY_FACE_GAP,
  },
  keyFaceGridMobile: {
    flexWrap: 'nowrap',
    paddingRight: 0,
  },
  keyFaceLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
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
