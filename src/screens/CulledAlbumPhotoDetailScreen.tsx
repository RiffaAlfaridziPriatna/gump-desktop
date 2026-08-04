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
import {memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {useLayout} from '@hooks/useLayout';
import {useImageDimensions} from '@hooks/useImageDimensions';
import {preloadImage} from '@lib/media/imagePreload';
import {resolveDetailDisplayUri, ensurePreview} from '@lib/storage/localStorage';
import {updatePhoto} from '@lib/culledAlbum/store';
import {syncPhotoFromStore} from '@/application/syncPhotoRepository';
import {Pressable, TouchableOpacity} from '@components/ui';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItemInfo,
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
import {APIResponse} from '@services/api';
import {ImageDimensions} from '@lib/media/imageDimensions';

type Props = StackScreenProps<MainStackParamList, 'CulledAlbumPhotoDetail'>;

type CullingFace = APIResponse.CullingFace;

const KEY_FACE_ITEM_SIZE = 64;
const KEY_FACE_COLUMN_COUNT = 4;
const KEY_FACE_GAP = 24;
const KEY_FACE_ROW_HEIGHT = KEY_FACE_ITEM_SIZE + KEY_FACE_GAP;
const KEY_FACE_SIDEBAR_WIDTH =
  KEY_FACE_COLUMN_COUNT * KEY_FACE_ITEM_SIZE +
  (KEY_FACE_COLUMN_COUNT - 1) * KEY_FACE_GAP;

type KeyFaceRow = {
  key: string;
  rowIndex: number;
  startIndex: number;
  faces: CullingFace[];
};

function buildKeyFaceRows(faces: CullingFace[]): KeyFaceRow[] {
  const rows: KeyFaceRow[] = [];
  for (let index = 0; index < faces.length; index += KEY_FACE_COLUMN_COUNT) {
    const rowIndex = index / KEY_FACE_COLUMN_COUNT;
    rows.push({
      key: `row-${rowIndex}`,
      rowIndex,
      startIndex: index,
      faces: faces.slice(index, index + KEY_FACE_COLUMN_COUNT),
    });
  }
  return rows;
}

type KeyFaceGridRowProps = {
  row: KeyFaceRow;
  uri: string;
  imageSize?: ImageDimensions | null;
  zoomFaceIndex: number | null;
  onFacePress: (index: number) => void;
  onTooltipAnchorChange?: (anchor: KeyFaceTooltipAnchor | null) => void;
};

/**
 * Same row pattern as CulledAlbumDetailSidebar. Prefer cropUri so Windows does
 * not hit-test an oversized transform-cropped full image across siblings.
 */
const KeyFaceGridRow = memo(
  function KeyFaceGridRow({
    row,
    uri,
    imageSize,
    zoomFaceIndex,
    onFacePress,
    onTooltipAnchorChange,
  }: KeyFaceGridRowProps) {
    return (
      <View style={styles.keyFaceRow}>
        {row.faces.map((face, offset) => {
          const faceIndex = row.startIndex + offset;
          return (
            <KeyFaceSidebarItem
              key={`face-${faceIndex}`}
              cropUri={face.cropUri}
              uri={face.cropUri ? undefined : uri}
              boundingBox={face.cropUri ? undefined : face.boundingBox}
              eyeStatus={face.eyeStatus}
              focusLevel={face.focusLevel}
              width={KEY_FACE_ITEM_SIZE}
              imageSize={face.cropUri ? undefined : imageSize}
              selected={zoomFaceIndex === faceIndex}
              onPress={() => onFacePress(faceIndex)}
              onTooltipAnchorChange={onTooltipAnchorChange}
            />
          );
        })}
        {row.faces.length < KEY_FACE_COLUMN_COUNT
          ? Array.from({
              length: KEY_FACE_COLUMN_COUNT - row.faces.length,
            }).map((_, fillerIndex) => (
              <View
                key={`filler-${row.rowIndex}-${fillerIndex}`}
                style={styles.keyFaceFiller}
              />
            ))
          : null}
      </View>
    );
  },
  (prev, next) =>
    prev.row === next.row &&
    prev.uri === next.uri &&
    prev.imageSize === next.imageSize &&
    prev.zoomFaceIndex === next.zoomFaceIndex,
);

function KeyFaceRowSeparator() {
  return <View style={styles.keyFaceRowSeparator} />;
}

function KeyFaceItemSeparator() {
  return <View style={styles.keyFaceItemSeparator} />;
}

export default function CulledAlbumPhotoDetailScreen({
  navigation,
  route,
}: Props) {
  const {albumId, photoId, faceIndex: initialFaceIndex} = route.params;
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
  const [zoomFaceIndex, setZoomFaceIndex] = useState<number | null>(() =>
    typeof initialFaceIndex === 'number' ? initialFaceIndex : null,
  );
  const [mainImageReady, setMainImageReady] = useState(false);
  const [tooltip, setTooltip] = useState<KeyFaceTooltipAnchor | null>(null);
  const [tooltipWidth, setTooltipWidth] = useState(0);
  const [tooltipHeight, setTooltipHeight] = useState(0);
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

  // Match album sidebar: don't lock tooltips on Windows wheel noise.
  const keyFaceScrollHandlers = useScrollAwareTooltipHandlers(
    scrollStoreRef.current,
    () => handleTooltipChangeRef.current(null),
    {trackWheelScroll: false},
  );

  const faces = analysis?.faces ?? [];
  const fileName = photo?.file.name ?? 'Photo';

  useEffect(() => {
    if (typeof initialFaceIndex !== 'number') {
      return;
    }
    if (initialFaceIndex < 0 || initialFaceIndex >= faces.length) {
      setZoomFaceIndex(null);
      return;
    }
    setZoomFaceIndex(initialFaceIndex);
  }, [faces.length, initialFaceIndex, photoId]);

  const [uri, setUri] = useState(() =>
    photo ? resolveDetailDisplayUri(photo.file) : '',
  );
  const imageSize = useImageDimensions(uri);
  const photoFileUri = photo?.file.uri;
  const photoPreviewUri = photo?.file.previewUri;
  const photoThumbnailUri = photo?.file.thumbnailUri;

  useEffect(() => {
    if (!photoFileUri) {
      setUri('');
      return;
    }

    const displayFile = {
      uri: photoFileUri,
      name: photo?.file.name ?? '',
      size: photo?.file.size ?? 0,
      type: photo?.file.type ?? '',
      thumbnailUri: photoThumbnailUri,
      previewUri: photoPreviewUri,
    };
    setUri(resolveDetailDisplayUri(displayFile));

    if (Platform.OS !== 'windows') {
      return;
    }

    let cancelled = false;
    ensurePreview(albumId, displayFile, photoId)
      .then(nextFile => {
        if (cancelled || !nextFile.previewUri) {
          return;
        }

        if (nextFile.previewUri !== photoPreviewUri) {
          updatePhoto(
            albumId,
            photoId,
            entry => {
              entry.file = {
                ...entry.file,
                previewUri: nextFile.previewUri,
              };
            },
            {recomputeTotals: false},
          );
          syncPhotoFromStore(albumId, photoId);
        }

        setUri(resolveDetailDisplayUri(nextFile));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [
    albumId,
    photo?.file.name,
    photo?.file.size,
    photo?.file.type,
    photoFileUri,
    photoId,
    photoPreviewUri,
    photoThumbnailUri,
  ]);

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

  const handleKeyFacePress = useCallback((index: number) => {
    setZoomFaceIndex(current => (current === index ? null : index));
  }, []);

  const handleKeyFacePressRef = useRef(handleKeyFacePress);
  handleKeyFacePressRef.current = handleKeyFacePress;

  const stableKeyFacePress = useCallback((index: number) => {
    handleKeyFacePressRef.current(index);
  }, []);

  const keyFaceRows = useMemo(
    () => (isMobileLayout ? [] : buildKeyFaceRows(faces)),
    [faces, isMobileLayout],
  );

  const renderKeyFaceRow = useCallback(
    ({item}: ListRenderItemInfo<KeyFaceRow>) => (
      <KeyFaceGridRow
        row={item}
        uri={uri}
        imageSize={imageSize}
        zoomFaceIndex={zoomFaceIndex}
        onFacePress={stableKeyFacePress}
        onTooltipAnchorChange={handleTooltipChangeRef.current}
      />
    ),
    [imageSize, stableKeyFacePress, uri, zoomFaceIndex],
  );

  const renderKeyFaceItem = useCallback(
    ({item: face, index}: ListRenderItemInfo<CullingFace>) => (
      <KeyFaceSidebarItem
        cropUri={face.cropUri}
        uri={face.cropUri ? undefined : uri}
        boundingBox={face.cropUri ? undefined : face.boundingBox}
        eyeStatus={face.eyeStatus}
        focusLevel={face.focusLevel}
        width={KEY_FACE_ITEM_SIZE}
        imageSize={face.cropUri ? undefined : imageSize}
        selected={zoomFaceIndex === index}
        onPress={() => stableKeyFacePress(index)}
        onTooltipAnchorChange={handleTooltipChangeRef.current}
      />
    ),
    [imageSize, stableKeyFacePress, uri, zoomFaceIndex],
  );

  const keyFaceRowKeyExtractor = useCallback(
    (row: KeyFaceRow) => row.key,
    [],
  );

  const keyFaceItemKeyExtractor = useCallback(
    (_: CullingFace, index: number) => `face-${index}`,
    [],
  );

  const getKeyFaceRowLayout = useCallback(
    (_data: ArrayLike<KeyFaceRow> | null | undefined, index: number) => ({
      length: KEY_FACE_ITEM_SIZE,
      offset: KEY_FACE_ROW_HEIGHT * index,
      index,
    }),
    [],
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
                  isMobileLayout ? (
                    <FlatList
                      {...keyFaceScrollHandlers}
                      data={faces}
                      keyExtractor={keyFaceItemKeyExtractor}
                      renderItem={renderKeyFaceItem}
                      horizontal
                      style={styles.keyFaceScroll}
                      contentContainerStyle={styles.keyFaceGridMobile}
                      showsHorizontalScrollIndicator
                      initialNumToRender={6}
                      maxToRenderPerBatch={6}
                      windowSize={3}
                      ItemSeparatorComponent={KeyFaceItemSeparator}
                    />
                  ) : (
                    <FlatList
                      {...keyFaceScrollHandlers}
                      data={keyFaceRows}
                      keyExtractor={keyFaceRowKeyExtractor}
                      renderItem={renderKeyFaceRow}
                      style={styles.keyFaceScroll}
                      contentContainerStyle={styles.keyFaceGrid}
                      showsVerticalScrollIndicator
                      initialNumToRender={5}
                      maxToRenderPerBatch={3}
                      windowSize={5}
                      updateCellsBatchingPeriod={100}
                      removeClippedSubviews={Platform.OS !== 'windows'}
                      getItemLayout={getKeyFaceRowLayout}
                      ItemSeparatorComponent={KeyFaceRowSeparator}
                    />
                  )
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
    minWidth: 0,
    overflow: 'hidden',
  },
  mainColumnMobile: {
    width: '100%',
    minHeight: 280,
  },
  sidebar: {
    width: KEY_FACE_SIDEBAR_WIDTH,
    minHeight: 0,
    gap: KEY_FACE_GAP,
    zIndex: 2,
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
    fontWeight: 600,
  },
  keyFaceScroll: {
    flex: 1,
  },
  keyFaceGrid: {
    paddingBottom: 8,
  },
  keyFaceGridMobile: {
    paddingRight: 0,
  },
  keyFaceRow: {
    flexDirection: 'row',
    gap: KEY_FACE_GAP,
  },
  keyFaceFiller: {
    width: KEY_FACE_ITEM_SIZE,
    height: KEY_FACE_ITEM_SIZE,
  },
  keyFaceItemSeparator: {
    width: KEY_FACE_GAP,
  },
  keyFaceRowSeparator: {
    height: KEY_FACE_GAP,
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
