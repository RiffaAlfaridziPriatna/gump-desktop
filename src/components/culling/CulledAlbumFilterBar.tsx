import {
  SelectionFilter,
  StarRating,
  StarRatingFilter,
} from '@lib/culling/culledAlbumPhotoFilters';
import {colors} from '@lib/ui/colors';
import {sansBoldStyle} from '@lib/ui/typography';
import {Pressable} from '@components/ui';
import {memo} from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import IconCheckCircle from '../../assets/images/icon_check_circle.svg';
import IconCheckCircleOutlined from '../../assets/images/icon_check_circle_outlined.svg';
import IconPlus from '../../assets/images/icon_plus.svg';
import IconScissors from '../../assets/images/icon_scissors.svg';
import IconUpload from '../../assets/images/icon_upload.svg';
import IconStar from '../../assets/images/icon_star.svg';

const STAR_RATINGS = [0, 1, 2, 3, 4, 5] as const;

type CulledAlbumFilterBarProps = {
  selectionFilter: SelectionFilter;
  starRatingFilter: StarRatingFilter;
  onSelectionFilterChange: (filter: SelectionFilter) => void;
  onStarRatingFilterChange: (filter: StarRatingFilter) => void;
  onUploadSelected: () => void;
  onAddPhotos?: () => void;
  selectedCount?: number;
  uploadDisabled?: boolean;
  addPhotosDisabled?: boolean;
  cullingInProgress?: boolean;
  isMobileLayout?: boolean;
};

function SelectionFilterButton({
  active,
  variant,
  onPress,
}: {
  active: boolean;
  variant: 'selected' | 'unselected';
  onPress: () => void;
}) {
  const iconColor = active ? colors.accent : colors.white;
  const iconSize = 24;

  return (
    <Pressable
      onPress={onPress}
      style={styles.selectionButton}
      accessibilityRole="button"
      accessibilityState={{selected: active}}>
      {variant === 'selected' ? (
        <IconCheckCircle width={iconSize} height={iconSize} color={iconColor} />
      ) : (
        <IconCheckCircleOutlined
          width={iconSize}
          height={iconSize}
          color={iconColor}
        />
      )}
    </Pressable>
  );
}

function StarFilterButton({
  rating,
  active,
  onPress,
}: {
  rating: number;
  active: boolean;
  onPress: () => void;
}) {
  const fill = active ? colors.accent : colors.textGray;
  const textColor = active ? colors.white : colors.textDark;

  return (
    <Pressable
      onPress={onPress}
      style={styles.starButton}
      accessibilityRole="button"
      accessibilityState={{selected: active}}
      accessibilityLabel={`Filter ${rating} star photos`}>
      <IconStar width={24} height={24} color={fill} />
      <View style={styles.starLabelContainer} pointerEvents="none">
        <Text style={[styles.starLabel, {color: textColor}]}>{rating}</Text>
      </View>
    </Pressable>
  );
}

export const CulledAlbumFilterBar = memo(function CulledAlbumFilterBar({
  selectionFilter,
  starRatingFilter,
  onSelectionFilterChange,
  onStarRatingFilterChange,
  onUploadSelected,
  onAddPhotos,
  selectedCount = 0,
  uploadDisabled = false,
  addPhotosDisabled = false,
  cullingInProgress = false,
  isMobileLayout = false,
}: CulledAlbumFilterBarProps) {
  function toggleSelectionFilter(next: Exclude<SelectionFilter, null>) {
    onSelectionFilterChange(selectionFilter === next ? null : next);
  }

  function toggleStarRatingFilter(next: StarRating) {
    if (starRatingFilter.includes(next)) {
      onStarRatingFilterChange(starRatingFilter.filter(rating => rating !== next));
    } else {
      onStarRatingFilterChange([...starRatingFilter, next]);
    }
  }

  const filterControls = (
    <View style={[styles.filters, isMobileLayout && styles.filtersMobile]}>
      <View style={styles.selectionButtons}>
        <SelectionFilterButton
          variant="selected"
          active={selectionFilter === 'selected'}
          onPress={() => toggleSelectionFilter('selected')}
        />
        <SelectionFilterButton
          variant="unselected"
          active={selectionFilter === 'unselected'}
          onPress={() => toggleSelectionFilter('unselected')}
        />
      </View>
      <View style={styles.divider} />
      <View style={styles.starButtons}>
        {STAR_RATINGS.map(rating => (
          <StarFilterButton
            key={rating}
            rating={rating}
            active={starRatingFilter.includes(rating)}
            onPress={() => toggleStarRatingFilter(rating)}
          />
        ))}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, isMobileLayout && styles.containerMobile]}>
      {isMobileLayout ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersScrollContent}>
          {filterControls}
        </ScrollView>
      ) : (
        filterControls
      )}

      {cullingInProgress ? (
        <View
          style={styles.cullingInProgressPill}
          accessibilityRole="text"
          accessibilityLabel="Culling in progress">
          <IconScissors width={16} height={16} color={colors.accent} />
          <Text style={styles.cullingInProgressText}>
            Culling in Progress...
          </Text>
        </View>
      ) : (
        <View style={styles.actions}>
          {onAddPhotos ? (
            <Pressable
              onPress={onAddPhotos}
              disabled={addPhotosDisabled}
              style={[
                styles.addPhotosButton,
                addPhotosDisabled && styles.addPhotosButtonDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Add photos to cull">
              <IconPlus
                width={16}
                height={16}
                color={addPhotosDisabled ? colors.textGray : colors.accent}
              />
              <Text
                style={[
                  styles.addPhotosButtonText,
                  addPhotosDisabled && styles.addPhotosButtonTextDisabled,
                ]}>
                Add Photos to Cull
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={onUploadSelected}
            disabled={uploadDisabled}
            style={[
              styles.uploadButton,
              uploadDisabled && styles.uploadButtonDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Upload selected photos">
            <IconUpload width={24} height={24} color={colors.white} />
            <Text style={styles.uploadButtonText}>
              {selectedCount > 0
                ? `Upload Selected (${selectedCount})`
                : 'Upload Selected'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
},
(prev, next) =>
  prev.selectionFilter === next.selectionFilter &&
  prev.starRatingFilter === next.starRatingFilter &&
  prev.selectedCount === next.selectedCount &&
  prev.uploadDisabled === next.uploadDisabled &&
  prev.addPhotosDisabled === next.addPhotosDisabled &&
  prev.cullingInProgress === next.cullingInProgress &&
  prev.isMobileLayout === next.isMobileLayout &&
  prev.onSelectionFilterChange === next.onSelectionFilterChange &&
  prev.onStarRatingFilterChange === next.onStarRatingFilterChange &&
  prev.onUploadSelected === next.onUploadSelected &&
  prev.onAddPhotos === next.onAddPhotos,
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 16,
    marginBottom: 16,
  },
  containerMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 12,
  },
  filtersScrollContent: {
    flexGrow: 1,
  },
  filters: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  filtersMobile: {
    flex: undefined,
  },
  selectionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  selectionButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: {
    width: 1,
    height: 24,
    backgroundColor: colors.divider,
    marginHorizontal: 4,
  },
  starButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  starButton: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starLabelContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starLabel: {
    ...sansBoldStyle,
    fontSize: 8,
    lineHeight: 8,
    includeFontPadding: false,
    textAlign: 'center',
    marginTop: 3,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  },
  addPhotosButton: {
    minHeight: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: 'transparent',
    paddingLeft: 20,
    paddingRight: 24,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexShrink: 0,
  },
  addPhotosButtonDisabled: {
    borderColor: colors.border,
    opacity: 0.4,
  },
  addPhotosButtonText: {
    ...sansBoldStyle,
    fontSize: 16,
    color: colors.accent,
    flexShrink: 0,
  },
  addPhotosButtonTextDisabled: {
    color: colors.textGray,
  },
  uploadButton: {
    minHeight: 48,
    minWidth: 180,
    borderRadius: 24,
    backgroundColor: colors.accent,
    paddingLeft: 20,
    paddingRight: 24,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexShrink: 0,
  },
  uploadButtonDisabled: {
    opacity: 0.4,
  },
  uploadButtonText: {
    ...sansBoldStyle,
    fontSize: 16,
    color: colors.white,
    flexShrink: 0,
  },
  cullingInProgressPill: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: colors.accent + '14',
    paddingLeft: 20,
    paddingRight: 24,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flexShrink: 0,
  },
  cullingInProgressText: {
    ...sansBoldStyle,
    fontSize: 16,
    color: colors.accent,
  },
});
