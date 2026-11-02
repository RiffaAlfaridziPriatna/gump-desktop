import {Pressable} from '@components/ui';
import {
  CULL_FILTER_LABELS,
  CULL_FILTER_ORDER,
} from '@lib/culling/cullFilterLabels';
import type {CullFilterKey} from '@lib/culling/cullingUtil';
import {colors} from '@lib/ui/colors';
import {fonts} from '@lib/ui/typography';
import {StyleSheet, Text, View} from 'react-native';

type AiCategoriesSectionProps = {
  activeFilters: Record<CullFilterKey, boolean>;
  filterCounts: Record<CullFilterKey, number>;
  onToggleFilter: (key: CullFilterKey) => void;
};

export function AiCategoriesSection({
  activeFilters,
  filterCounts,
  onToggleFilter,
}: AiCategoriesSectionProps) {
  return (
    <View>
      <Text style={styles.caption} accessibilityRole="header">
        AI Categories
      </Text>
      <View style={styles.rows}>
        {CULL_FILTER_ORDER.map(key => {
          const checked = activeFilters[key];
          return (
            <Pressable
              key={key}
              onPress={() => onToggleFilter(key)}
              style={styles.row}
              accessibilityRole="checkbox"
              accessibilityLabel={`${CULL_FILTER_LABELS[key]}, ${filterCounts[key]}`}
              accessibilityState={{checked}}>
              <View style={[styles.box, checked && styles.boxChecked]}>
                {checked && <Text style={styles.check}>✓</Text>}
              </View>
              <Text style={styles.label}>{CULL_FILTER_LABELS[key]}</Text>
              <Text style={styles.count}>{filterCounts[key]}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: 16,
    color: colors.white,
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  rows: {gap: 4},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  box: {
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  check: {fontSize: 12, lineHeight: 14, color: colors.white},
  label: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.white,
  },
  count: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.textMuted,
  },
});
