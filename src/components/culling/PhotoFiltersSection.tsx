import {Pressable} from '@components/ui';
import type {SelectionFilter} from '@lib/culling/culledAlbumPhotoFilters';
import {colors} from '@lib/ui/colors';
import {fonts, sansBoldStyle} from '@lib/ui/typography';
import {StyleSheet, Text, View} from 'react-native';
import IconChevronDown from '../../assets/images/icon_chevron_down.svg';
import IconChevronUp from '../../assets/images/icon_chevron_up.svg';

type PhotoFiltersSectionProps = {
  expanded: boolean;
  onToggle: () => void;
  totalCount: number;
  pickedCount: number;
  selectionFilter: SelectionFilter;
  hasActiveFilter: boolean;
  onShowAll: () => void;
  onTogglePicked: () => void;
};

type NavRowProps = {
  label: string;
  count: number;
  selected: boolean;
  onPress: () => void;
};

function NavRow({label, count, selected, onPress}: NavRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.row, selected && styles.rowSelected]}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${count}`}
      accessibilityState={{selected}}>
      <Text style={selected ? styles.labelSelected : styles.label}>
        {label}
      </Text>
      <Text style={styles.count}>{count}</Text>
    </Pressable>
  );
}

export function PhotoFiltersSection({
  expanded,
  onToggle,
  totalCount,
  pickedCount,
  selectionFilter,
  hasActiveFilter,
  onShowAll,
  onTogglePicked,
}: PhotoFiltersSectionProps) {
  const Chevron = expanded ? IconChevronUp : IconChevronDown;
  return (
    <View style={styles.container}>
      <Pressable
        onPress={onToggle}
        style={styles.header}
        accessibilityRole="button"
        accessibilityLabel="Photo Filters"
        accessibilityState={{expanded}}>
        <Chevron width={16} height={16} color={colors.white} />
        <Text style={styles.title}>Photo Filters</Text>
      </Pressable>
      {expanded && (
        <View style={styles.rows}>
          <NavRow
            label="All Photos"
            count={totalCount}
            selected={!hasActiveFilter}
            onPress={onShowAll}
          />
          <NavRow
            label="Picked for Upload"
            count={pickedCount}
            selected={selectionFilter === 'selected'}
            onPress={onTogglePicked}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {gap: 14},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  title: {
    ...sansBoldStyle,
    fontSize: 16,
    color: colors.white,
  },
  rows: {gap: 8},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  rowSelected: {backgroundColor: colors.cardBackgroundSecondary},
  label: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.white,
  },
  // Inter Semi Bold is not bundled; sansBold stands in until the font is added.
  labelSelected: {
    flex: 1,
    ...sansBoldStyle,
    fontSize: 14,
    color: colors.white,
  },
  count: {
    ...sansBoldStyle,
    fontSize: 14,
    color: colors.white,
  },
});
