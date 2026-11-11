import {Pressable} from '@components/ui';
import {
  CULL_FILTER_LABELS,
  CULL_FILTER_ORDER,
} from '@lib/culling/cullFilterLabels';
import type {CullFilterKey} from '@lib/culling/cullingUtil';
import {colors} from '@lib/ui/colors';
import {fonts, sansSemiBoldStyle} from '@lib/ui/typography';
import type React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import type {SvgProps} from 'react-native-svg';
import IconCheck from '../../assets/images/lucide_check.svg';
import IconEyeOff from '../../assets/images/lucide_eye_off.svg';
import IconFocus from '../../assets/images/lucide_focus.svg';
import IconHelp from '../../assets/images/lucide_circle_help.svg';
import IconLayers from '../../assets/images/lucide_layers.svg';
import IconSparkles from '../../assets/images/lucide_sparkles.svg';

const CATEGORY_ICONS: Record<CullFilterKey, React.FC<SvgProps>> = {
  aiSelected: IconSparkles,
  maybe: IconHelp,
  blurred: IconFocus,
  closedEyes: IconEyeOff,
  duplicated: IconLayers,
};

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
    <View style={styles.container}>
      <Text style={styles.caption} accessibilityRole="header">
        AI Categories
      </Text>
      <View style={styles.rows}>
        {CULL_FILTER_ORDER.map(key => {
          const checked = activeFilters[key];
          const Icon = CATEGORY_ICONS[key];
          return (
            <Pressable
              key={key}
              onPress={() => onToggleFilter(key)}
              style={styles.row}
              accessibilityRole="checkbox"
              accessibilityLabel={`${CULL_FILTER_LABELS[key]}, ${filterCounts[key]}`}
              accessibilityState={{checked}}>
              <View style={[styles.box, checked && styles.boxChecked]}>
                {checked && (
                  <IconCheck width={12} height={12} color={colors.white} />
                )}
              </View>
              <Icon width={14} height={14} color={colors.textGray} />
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
  container: {gap: 4},
  caption: {
    ...sansSemiBoldStyle,
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
