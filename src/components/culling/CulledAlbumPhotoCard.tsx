import {CulledAlbumPhotoThumbnail} from '@components/culling/CulledAlbumPhotoThumbnail';
import {Pressable} from '@components/ui';
import {useCulledAlbumPhoto} from '@context/culledAlbum';
import {
  useCulledAlbumPhotoHovered,
  useCulledAlbumPhotoHoverStore,
} from '@lib/culledAlbum/photoHover';
import {isCulledPhotoDisabled, toCullingPhoto} from '@lib/culledAlbum/types';
import {resolveGridDisplayUri} from '@lib/storage/localStorage';
import {colors} from '@lib/ui/colors';
import {fonts} from '@lib/ui/typography';
import {forwardRef, memo, useCallback, useRef, type MutableRefObject} from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import IconTrash from '../../assets/images/icon_trash.svg';

const STAR_INDICES = [0, 1, 2, 3, 4] as const;
const STAR_SIZE = 16;
const STAR_GAP = 2;
const STAR_SLOT_WIDTH = STAR_SIZE + STAR_GAP;
const STAR_ROW_WIDTH =
  STAR_SIZE * STAR_INDICES.length + STAR_GAP * (STAR_INDICES.length - 1);
const CHROME_HIT_PADDING = 6;
const SELECT_ICON_SIZE = 16;

const STAR_RATING_IMAGES = [
  require('../../assets/images/star_rating_0.png'),
  require('../../assets/images/star_rating_1.png'),
  require('../../assets/images/star_rating_2.png'),
  require('../../assets/images/star_rating_3.png'),
  require('../../assets/images/star_rating_4.png'),
  require('../../assets/images/star_rating_5.png'),
] as const;

const SELECT_ICON_SELECTED = require('../../assets/images/icon_check_circle.png');
const SELECT_ICON_UNSELECTED = require('../../assets/images/icon_check_circle_outlined.png');

type HitFrame = {x: number; y: number; width: number; height: number};

export type CulledAlbumPhotoCardProps = {
  albumId: string;
  photoId: string;
  cardWidth: number;
  canDeletePhoto: boolean;
  isMobileLayout: boolean;
  deferHeavyMediaWork?: boolean;
  onOpenDetail: (photoId: string) => void;
  onToggleSelection: (photoId: string, selected: boolean) => void;
  onDeletePress: (photoId: string, fileName: string) => void;
  onStarPress: (
    photoId: string,
    starIndex: number,
    currentRating: number,
  ) => void;
};

type StarRatingRowProps = {
  rating: number;
  disabled: boolean;
  onLayout?: () => void;
};

const StarRatingRow = memo(
  forwardRef<View, StarRatingRowProps>(function StarRatingRow(
    {rating, disabled, onLayout},
    ref,
  ) {
    const clamped = Math.min(5, Math.max(0, Math.round(rating)));
    return (
      <View
        ref={ref}
        collapsable={false}
        onLayout={onLayout}
        pointerEvents="none"
        style={[styles.starRatingContainer, disabled && styles.chromeDisabled]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <Image
          source={STAR_RATING_IMAGES[clamped]}
          style={styles.starRatingImage}
          resizeMode="contain"
        />
      </View>
    );
  }),
);

function isInsideHit(x: number, y: number, frame: HitFrame): boolean {
  return (
    x >= frame.x - CHROME_HIT_PADDING &&
    x <= frame.x + frame.width + CHROME_HIT_PADDING &&
    y >= frame.y - CHROME_HIT_PADDING &&
    y <= frame.y + frame.height + CHROME_HIT_PADDING
  );
}

function starIndexFromHit(x: number, frame: HitFrame): number {
  return Math.min(
    4,
    Math.max(0, Math.floor((x - frame.x) / STAR_SLOT_WIDTH)),
  );
}

export const CulledAlbumPhotoCard = memo(function CulledAlbumPhotoCard({
  albumId,
  photoId,
  cardWidth,
  canDeletePhoto,
  isMobileLayout,
  deferHeavyMediaWork = false,
  onOpenDetail,
  onToggleSelection,
  onDeletePress,
  onStarPress,
}: CulledAlbumPhotoCardProps) {
  const photo = useCulledAlbumPhoto(albumId, photoId);
  const hoverStore = useCulledAlbumPhotoHoverStore();
  const isHovered = useCulledAlbumPhotoHovered(photoId);
  const file = photo?.file;
  const uri = file ? resolveGridDisplayUri(file) ?? '' : '';
  const analysis =
    photo?.analysisStatus === 'analyzed' ? toCullingPhoto(photo) : undefined;
  const disabled = photo ? isCulledPhotoDisabled(photo) : true;
  const isSelected = analysis?.selected ?? false;
  const showDeleteButton =
    canDeletePhoto && !disabled && (isMobileLayout || isHovered);
  const fileName = file?.name ?? '';
  const starRating = analysis?.starRating ?? 0;

  const cardRootRef = useRef<View>(null);
  const starRowRef = useRef<View>(null);
  const selectIconRef = useRef<View>(null);
  const starFrameRef = useRef<HitFrame>({x: 0, y: 0, width: 0, height: 0});
  const selectFrameRef = useRef<HitFrame>({x: 0, y: 0, width: 0, height: 0});

  const handleOpenDetail = useCallback(
    () => onOpenDetail(photoId),
    [onOpenDetail, photoId],
  );
  const handleToggleSelection = useCallback(() => {
    if (analysis) {
      onToggleSelection(photoId, !analysis.selected);
    }
  }, [analysis, onToggleSelection, photoId]);

  const measureChildFrame = useCallback(
    (child: View | null, target: MutableRefObject<HitFrame>) => {
      const root = cardRootRef.current;
      if (!root || !child) {
        return;
      }
      child.measureLayout(
        root,
        (x, y, width, height) => {
          target.current = {x, y, width, height};
        },
        () => undefined,
      );
    },
    [],
  );

  const updateStarFrame = useCallback(() => {
    measureChildFrame(starRowRef.current, starFrameRef);
  }, [measureChildFrame]);

  const updateSelectFrame = useCallback(() => {
    measureChildFrame(selectIconRef.current, selectFrameRef);
  }, [measureChildFrame]);

  const handleChromeHit = useCallback(
    (x: number, y: number, starFrame: HitFrame, selectFrame: HitFrame) => {
      if (disabled || !analysis) {
        return false;
      }
      if (isInsideHit(x, y, starFrame)) {
        onStarPress(photoId, starIndexFromHit(x, starFrame), starRating);
        return true;
      }
      if (isInsideHit(x, y, selectFrame)) {
        handleToggleSelection();
        return true;
      }
      return false;
    },
    [
      analysis,
      disabled,
      handleToggleSelection,
      onStarPress,
      photoId,
      starRating,
    ],
  );

  const handleCardPress = useCallback(
    (event: {
      nativeEvent: {
        locationX: number;
        locationY: number;
        pageX?: number;
        pageY?: number;
      };
    }) => {
      const {locationX, locationY, pageX, pageY} = event.nativeEvent;

      if (pageX != null && pageY != null && starRowRef.current && selectIconRef.current) {
        starRowRef.current.measureInWindow((sx, sy, sw, sh) => {
          selectIconRef.current?.measureInWindow((cx, cy, cw, ch) => {
            if (
              !handleChromeHit(
                pageX,
                pageY,
                {x: sx, y: sy, width: sw, height: sh},
                {x: cx, y: cy, width: cw, height: ch},
              )
            ) {
              handleOpenDetail();
            }
          });
        });
        return;
      }

      if (
        !handleChromeHit(
          locationX,
          locationY,
          starFrameRef.current,
          selectFrameRef.current,
        )
      ) {
        handleOpenDetail();
      }
    },
    [handleChromeHit, handleOpenDetail],
  );

  const handleHoverIn = useCallback(() => {
    hoverStore.hoverIn(photoId);
  }, [hoverStore, photoId]);

  const handleHoverOut = useCallback(() => {
    hoverStore.hoverOut(photoId);
  }, [hoverStore, photoId]);

  if (!photo || !file) {
    return <View style={[styles.photoCard, {width: cardWidth}]} />;
  }

  const SelectionIcon = isSelected
    ? SELECT_ICON_SELECTED
    : SELECT_ICON_UNSELECTED;

  return (
    <Pressable
      style={[styles.photoCard, {width: cardWidth}]}
      onHoverIn={isMobileLayout ? undefined : handleHoverIn}
      onHoverOut={isMobileLayout ? undefined : handleHoverOut}
      onPress={handleCardPress}>
      <View ref={cardRootRef} collapsable={false} style={styles.photoCardRoot}>
        <View style={styles.thumbnailWrapper}>
          <CulledAlbumPhotoThumbnail
            albumId={albumId}
            photoId={photoId}
            width={cardWidth}
            uri={uri}
            thumbnailWidth={file.thumbnailWidth}
            thumbnailHeight={file.thumbnailHeight}
            deferHeavyMediaWork={deferHeavyMediaWork}
          />
          {showDeleteButton && (
            <Pressable
              style={styles.deletePhotoButton}
              onPress={event => {
                event.stopPropagation();
                onDeletePress(photoId, fileName);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${fileName}`}>
              <IconTrash width={24} height={24} color={colors.text} />
            </Pressable>
          )}
        </View>
        <View style={styles.photoInfoContainer}>
          <Text style={styles.fileName} numberOfLines={1}>
            {fileName}
          </Text>

          <View style={styles.otherInfoContainer}>
            <StarRatingRow
              ref={starRowRef}
              rating={starRating}
              disabled={disabled}
              onLayout={updateStarFrame}
            />

            <View
              ref={selectIconRef}
              collapsable={false}
              onLayout={updateSelectFrame}
              style={[
                styles.selectionButton,
                disabled && styles.chromeDisabled,
              ]}
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants">
              <Image
                source={SelectionIcon}
                style={styles.selectionIcon}
                resizeMode="contain"
              />
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  photoCard: {
    gap: 8,
  },
  photoCardRoot: {
    gap: 8,
  },
  thumbnailWrapper: {
    position: 'relative',
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
    width: STAR_ROW_WIDTH,
    height: STAR_SIZE,
    justifyContent: 'center',
  },
  starRatingImage: {
    width: STAR_ROW_WIDTH,
    height: STAR_SIZE,
  },
  chromeDisabled: {
    opacity: 0.5,
  },
  selectionButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionIcon: {
    width: SELECT_ICON_SIZE,
    height: SELECT_ICON_SIZE,
  },
});
