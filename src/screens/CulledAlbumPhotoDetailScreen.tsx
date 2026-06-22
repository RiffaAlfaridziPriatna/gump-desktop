import {FaceStatusTooltip, type KeyFaceTooltipAnchor} from '@components/culling/FaceStatusTooltip';
import {KeyFaceSidebarItem} from '@components/culling/KeyFaceSidebarItem';
import {PhotoDetailImageViewer} from '@components/culling/PhotoDetailImageViewer';
import {useCulledAlbumPhotosState, useCulledAlbumStore} from '@context/culledAlbum';
import {cullingEngine} from '@lib/culling/cullingEngine';
import {toCullingPhoto, isCulledPhotoDisabled} from '@lib/culledAlbum/types';
import {colors} from '@lib/colors';
import {fonts} from '@lib/typography';
import {MainStackParamList} from '../app/MainNavigator';
import {StackScreenProps} from '@react-navigation/stack';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import IconCheckCircle from '../assets/images/icon_check_circle.svg';
import IconCheckCircleOutlined from '../assets/images/icon_check_circle_outlined.svg';
import IconClose from '../assets/images/icon_close.svg';
import IconStar from '../assets/images/icon_star.svg';
import IconStarOutlined from '../assets/images/icon_star_outlined.svg';

type Props = StackScreenProps<MainStackParamList, 'CulledAlbumPhotoDetail'>;

export default function CulledAlbumPhotoDetailScreen({
  navigation,
  route,
}: Props) {
  const {albumId, photoId} = route.params;
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

  const faces = analysis?.faces ?? [];
  const fileName = photo?.file.name ?? 'Photo';
  const uri = photo?.file.uri ?? '';
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

  if (!photo || !analysis) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.missingState}>
          <Text style={styles.missingStateText}>Photo not found.</Text>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backLink}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View
        ref={screenRootRef}
        style={styles.screenRoot}
        onLayout={syncScreenOrigin}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
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
            onPress={() => navigation.goBack()}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Close photo detail"
          >
            <IconClose width={32} height={32} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.content}>
          <View style={styles.mainColumn}>
            <PhotoDetailImageViewer
              uri={uri}
              faces={faces}
              zoomFaceIndex={zoomFaceIndex}
              onTooltipAnchorChange={handleTooltipChange}
            />
          </View>

          <View style={styles.sidebar}>
            <Text style={styles.sidebarTitle}>Key Faces ({faces.length})</Text>
            <ScrollView
              style={styles.keyFaceScroll}
              contentContainerStyle={styles.keyFaceGrid}
              showsVerticalScrollIndicator
            >
              {faces.map((face, index) => (
                <KeyFaceSidebarItem
                  key={face.rekognitionFaceId ?? `${index}`}
                  uri={uri}
                  boundingBox={face.boundingBox}
                  eyeStatus={face.eyeStatus}
                  focusLevel={face.focusLevel}
                  width={64}
                  selected={zoomFaceIndex === index}
                  onPress={() =>
                    setZoomFaceIndex(current =>
                      current === index ? null : index,
                    )
                  }
                  onTooltipAnchorChange={handleTooltipChange}
                />
              ))}
            </ScrollView>
          </View>
        </View>

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
    paddingHorizontal: 48,
    paddingTop: 40,
    paddingBottom: 24,
    gap: 16,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    minWidth: 0,
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
    paddingHorizontal: 48,
    paddingBottom: 24,
    minHeight: 0,
  },
  mainColumn: {
    width: '70%',
    minHeight: 0,
  },
  sidebar: {
    flex: 1,
    minHeight: 0,
    gap: 24,
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingRight: 20,
    overflow: 'visible',
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
    fontFamily: fonts.sansBold,
    fontSize: 14,
    color: colors.accent,
  },
});
