import {
  SelectionFilter,
  StarRating,
  StarRatingFilter,
} from '@lib/culling/culledAlbumPhotoFilters';
import {colors} from '@lib/colors';
import {fonts} from '@lib/typography';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import IconCheckCircle from '../../assets/images/icon_check_circle.svg';
import IconCheckCircleOutlined from '../../assets/images/icon_check_circle_outlined.svg';
import IconUpload from '../../assets/images/icon_upload.svg';
import IconStar from '../../assets/images/icon_star.svg';

const STAR_RATINGS = [0, 1, 2, 3, 4, 5] as const;

type CulledAlbumFilterBarProps = {
  selectionFilter: SelectionFilter;
  starRatingFilter: StarRatingFilter;
  onSelectionFilterChange: (filter: SelectionFilter) => void;
  onStarRatingFilterChange: (filter: StarRatingFilter) => void;
  onUploadSelected: () => void;
  uploaded?: boolean;
  uploadDisabled?: boolean;
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

export function CulledAlbumFilterBar({
  selectionFilter,
  starRatingFilter,
  onSelectionFilterChange,
  onStarRatingFilterChange,
  onUploadSelected,
  uploaded = false,
  uploadDisabled = false,
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

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
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

        <View style={styles.starRow}>
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

      <Pressable
        onPress={onUploadSelected}
        disabled={uploaded || uploadDisabled}
        style={[
          styles.uploadButton,
          uploaded && styles.uploadButtonUploaded,
          uploadDisabled && styles.uploadButtonDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Upload selected photos">
        {uploaded ? (
          <IconCheckCircle width={24} height={24} color={colors.accent} />
        ) : (
          <IconUpload width={24} height={24} color={colors.white} />
        )}
        <Text
          style={[
            styles.uploadButtonText,
            uploaded && styles.uploadButtonTextUploaded,
          ]}
        >
          {uploaded ? 'Uploaded' : 'Upload Selected'}
        </Text>
   
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 16,
    marginBottom: 16,
  },
  filters: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
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
  starRow: {
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
    fontFamily: fonts.sansBold,
    fontSize: 8,
    lineHeight: 8,
    includeFontPadding: false,
    textAlign: 'center',
    marginTop: 3,
  },
  uploadButton: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    paddingLeft: 20,
    paddingRight: 24,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  uploadButtonDisabled: {
    opacity: 0.4,
  },
  uploadButtonUploaded: {
    backgroundColor: colors.accent + '14',
  },
  uploadButtonText: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.white,
  },
  uploadButtonTextUploaded: {
    color: colors.accent,
  },
});
