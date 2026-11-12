import {CulledAlbumPhotoThumbnail} from '@components/culling/CulledAlbumPhotoThumbnail';
import {CulledAlbumPhotoCardOverlay} from '@components/culling/CulledAlbumPhotoCardOverlay';
import {CulledAlbumPhotoFocusFrame} from '@components/culling/CulledAlbumPhotoFocusFrame';
import {Pressable} from '@components/ui';
import {useCulledAlbumPhoto} from '@context/culledAlbum';
import {listPhotoBadges} from '@components/culling/PhotoAiBadges';
import {useCulledAlbumPhotoHovered, useCulledAlbumPhotoHoverStore} from '@lib/culledAlbum/photoHover';
import {
  isInsideHit,
  starIndexFromHit,
  type HitFrame,
} from '@lib/culledAlbum/cardChromeHit';
import {isCulledPhotoDisabled, toCullingPhoto} from '@lib/culledAlbum/types';
import {resolveGridDisplayUri} from '@lib/storage/localStorage';
import {colors} from '@lib/ui/colors';
import {fonts} from '@lib/ui/typography';
import {
  CARD_FOOTER_HEIGHT,
  CARD_INTERNAL_GAP,
  CARD_PADDING_BOTTOM,
  CARD_PADDING_HORIZONTAL,
  CARD_PADDING_TOP,
  thumbnailWidthForCard,
} from '@components/culling/culledAlbumGridRows';
import {forwardRef, memo, useCallback, useRef, type MutableRefObject} from 'react';
import {Image, Platform, StyleSheet, Text, View} from 'react-native';

const STAR_INDICES = [0, 1, 2, 3, 4] as const;
const STAR_SIZE = 16;
const STAR_GAP = 4;
const STAR_SLOT_WIDTH = STAR_SIZE + STAR_GAP;
const STAR_ROW_WIDTH =
  STAR_SIZE * STAR_INDICES.length + STAR_GAP * (STAR_INDICES.length - 1);
const PICK_SIZE = 20;
const PICK_CHECK_SIZE = 13;

const STAR_RATING_IMAGES = [
  require('../../assets/images/star_rating_0.png'),
  require('../../assets/images/star_rating_1.png'),
  require('../../assets/images/star_rating_2.png'),
  require('../../assets/images/star_rating_3.png'),
  require('../../assets/images/star_rating_4.png'),
  require('../../assets/images/star_rating_5.png'),
] as const;
const PICK_CHECK_IMAGE = require('../../assets/images/icon_pick_check_512.png');

export type CulledAlbumPhotoCardProps = {
  albumId: string;
  photoId: string;
  cardWidth: number;
  canDeletePhoto: boolean;
  isMobileLayout: boolean;
  deferHeavyMediaWork?: boolean;
  similarShotCount?: number;
  isFocused?: boolean;
  onCardPress: (photoId: string) => void;
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
    // Windows needs a remount to refresh bitmap chrome; macOS remounts cost scroll.
    const imageKey = Platform.OS === 'windows' ? clamped : undefined;
    return (
      <View
        ref={ref}
        collapsable={onLayout == null}
        onLayout={onLayout}
        pointerEvents="none"
        style={[styles.starRatingContainer, disabled && styles.chromeDisabled]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <Image
          key={imageKey}
          source={STAR_RATING_IMAGES[clamped]}
          style={styles.starRatingImage}
          resizeMode="contain"
        />
      </View>
    );
  }),
);

export const CulledAlbumPhotoCard = memo(function CulledAlbumPhotoCard({
  albumId,
  photoId,
  cardWidth,
  canDeletePhoto,
  isMobileLayout,
  deferHeavyMediaWork = false,
  similarShotCount,
  isFocused = false,
  onCardPress,
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
        onStarPress(photoId, starIndexFromHit(x, starFrame, STAR_SLOT_WIDTH), starRating);
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
              onCardPress(photoId);
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
        onCardPress(photoId);
      }
    },
    [handleChromeHit, onCardPress, photoId],
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

  return (
    <Pressable
      style={[styles.photoCard, {width: cardWidth}]}
      onHoverIn={isMobileLayout ? undefined : handleHoverIn}
      onHoverOut={isMobileLayout ? undefined : handleHoverOut}
      accessible={similarShotCount == null && listPhotoBadges(photo).length === 0}
      accessibilityState={{selected: isFocused}}
      onPress={handleCardPress}>
      <View ref={cardRootRef} collapsable={false} style={styles.photoCardRoot}>
        <View style={styles.thumbnailWrapper}>
          <CulledAlbumPhotoThumbnail
            albumId={albumId}
            photoId={photoId}
            width={thumbnailWidthForCard(cardWidth)}
            uri={uri}
            thumbnailWidth={file.thumbnailWidth}
            thumbnailHeight={file.thumbnailHeight}
            deferHeavyMediaWork={deferHeavyMediaWork}
          />
          <CulledAlbumPhotoCardOverlay
            photoId={photoId}
            photo={photo}
            showDeleteButton={showDeleteButton}
            similarShotCount={similarShotCount}
            onDeletePress={onDeletePress}
            onOpenDetail={handleOpenDetail}
          />
        </View>
        <View style={styles.photoInfoContainer}>
          <View
            ref={selectIconRef}
            collapsable={false}
            onLayout={updateSelectFrame}
            style={[styles.selectionButton, disabled && styles.chromeDisabled]}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants">
            <View
              style={[
                styles.pickCircle,
                isSelected ? styles.pickCircleSelected : styles.pickCircleEmpty,
              ]}>
              {isSelected && (
                <Image
                  source={PICK_CHECK_IMAGE}
                  style={styles.pickCheck}
                  resizeMode="contain"
                />
              )}
            </View>
          </View>

          <View style={styles.fileNameSlot}>
            <Text style={styles.fileName} numberOfLines={1}>
              {fileName}
            </Text>
          </View>

          <StarRatingRow
            ref={starRowRef}
            rating={starRating}
            disabled={disabled}
            onLayout={updateStarFrame}
          />
        </View>
        {isFocused && <CulledAlbumPhotoFocusFrame />}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  photoCard: {
    gap: CARD_INTERNAL_GAP,
  },
  photoCardRoot: {
    gap: CARD_INTERNAL_GAP,
    backgroundColor: colors.photoCardBackground,
    borderRadius: 6,
    paddingTop: CARD_PADDING_TOP,
    paddingHorizontal: CARD_PADDING_HORIZONTAL,
    paddingBottom: CARD_PADDING_BOTTOM,
  },
  thumbnailWrapper: {
    position: 'relative',
  },
  photoInfoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: CARD_FOOTER_HEIGHT,
    paddingRight: 2,
  },
  fileNameSlot: {
    flex: 1,
    height: CARD_FOOTER_HEIGHT,
    justifyContent: 'center',
    minWidth: 0,
  },
  fileName: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 16,
    color: colors.text,
  },
  starRatingContainer: {
    width: STAR_ROW_WIDTH,
    height: CARD_FOOTER_HEIGHT,
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
  pickCircle: {
    width: PICK_SIZE,
    height: PICK_SIZE,
    borderRadius: PICK_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickCircleEmpty: {
    borderWidth: 1,
    borderColor: colors.white,
  },
  pickCircleSelected: {
    backgroundColor: colors.accent,
  },
  pickCheck: {
    width: PICK_CHECK_SIZE,
    height: PICK_CHECK_SIZE,
    tintColor: colors.white,
  },
});
