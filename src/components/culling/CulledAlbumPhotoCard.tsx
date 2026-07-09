import {CulledAlbumPhotoThumbnail} from '@components/culling/CulledAlbumPhotoThumbnail';
import {Pressable} from '@components/ui';
import {
  useCulledAlbumPhotoHovered,
  useCulledAlbumPhotoHoverStore,
} from '@lib/culledAlbum/photoHover';
import {colors} from '@lib/ui/colors';
import {fonts} from '@lib/ui/typography';
import {APIResponse} from '@services/api';
import {FileAsset} from '@services/upload/types';
import {memo, useCallback} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import IconCheckCircle from '../../assets/images/icon_check_circle.svg';
import IconCheckCircleOutlined from '../../assets/images/icon_check_circle_outlined.svg';
import IconStar from '../../assets/images/icon_star.svg';
import IconStarOutlined from '../../assets/images/icon_star_outlined.svg';
import IconTrash from '../../assets/images/icon_trash.svg';

export type CulledAlbumPhotoCardProps = {
  photoId: string;
  file: FileAsset;
  analysis?: APIResponse.CullingPhoto;
  cardWidth: number;
  canDeletePhoto: boolean;
  disabled: boolean;
  isMobileLayout: boolean;
  onOpenDetail: (photoId: string) => void;
  onToggleSelection: (photoId: string, selected: boolean) => void;
  onDeletePress: (photoId: string, fileName: string) => void;
  onStarPress: (
    photoId: string,
    starIndex: number,
    currentRating: number,
  ) => void;
};

export const CulledAlbumPhotoCard = memo(function CulledAlbumPhotoCard({
  photoId,
  file,
  analysis,
  cardWidth,
  canDeletePhoto,
  disabled,
  isMobileLayout,
  onOpenDetail,
  onToggleSelection,
  onDeletePress,
  onStarPress,
}: CulledAlbumPhotoCardProps) {
  const hoverStore = useCulledAlbumPhotoHoverStore();
  const isHovered = useCulledAlbumPhotoHovered(photoId);
  const isSelected = analysis?.selected ?? false;
  const showDeleteButton = canDeletePhoto && (isMobileLayout || isHovered);

  const handleOpenDetail = useCallback(
    () => onOpenDetail(photoId),
    [onOpenDetail, photoId],
  );
  const handleToggleSelection = useCallback(() => {
    if (analysis) {
      onToggleSelection(photoId, !analysis.selected);
    }
  }, [analysis, onToggleSelection, photoId]);

  const handleHoverIn = useCallback(() => {
    hoverStore.hoverIn(photoId);
  }, [hoverStore, photoId]);

  const handleHoverOut = useCallback(() => {
    hoverStore.hoverOut(photoId);
  }, [hoverStore, photoId]);

  return (
    <Pressable
      style={[styles.photoCard, {width: cardWidth}]}
      onHoverIn={isMobileLayout ? undefined : handleHoverIn}
      onHoverOut={isMobileLayout ? undefined : handleHoverOut}
      onPress={handleOpenDetail}>
      <View style={styles.thumbnailWrapper}>
        <CulledAlbumPhotoThumbnail file={file} width={cardWidth} />
        {showDeleteButton && (
          <Pressable
            style={styles.deletePhotoButton}
            onPress={event => {
              event.stopPropagation();
              onDeletePress(photoId, file.name);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${file.name}`}>
            <IconTrash width={24} height={24} color={colors.text} />
          </Pressable>
        )}
      </View>
      <View style={styles.photoInfoContainer}>
        <Text style={styles.fileName} numberOfLines={1}>
          {file.name}
        </Text>

        <View style={styles.otherInfoContainer}>
          <View style={styles.starRatingContainer}>
            {[0, 1, 2, 3, 4].map(starIndex => {
              const currentRating = analysis?.starRating ?? 0;
              const filled = currentRating > starIndex;
              const Icon = filled ? IconStar : IconStarOutlined;
              return (
                <Pressable
                  key={starIndex}
                  onPress={event => {
                    event.stopPropagation();
                    if (analysis && !disabled) {
                      onStarPress(photoId, starIndex, currentRating);
                    }
                  }}
                  style={[
                    styles.starButton,
                    disabled && styles.starButtonDisabled,
                  ]}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel={`Rate ${starIndex + 1} stars`}
                  accessibilityState={{
                    selected: currentRating === starIndex + 1,
                  }}>
                  <Icon width={16} height={16} color={colors.accent} />
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={disabled ? undefined : handleToggleSelection}
            style={[
              styles.selectionButton,
              disabled && styles.selectionButtonDisabled,
            ]}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{selected: isSelected}}>
            {isSelected ? (
              <IconCheckCircle width={16} height={16} color={colors.text} />
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
    </Pressable>
  );
});

const styles = StyleSheet.create({
  photoCard: {
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  starButton: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starButtonDisabled: {
    opacity: 0.5,
  },
  selectionButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionButtonDisabled: {
    opacity: 0.5,
  },
});
