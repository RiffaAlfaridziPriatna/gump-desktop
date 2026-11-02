import {
  ClearFiltersButton,
  CulledAlbumNoResults,
} from '@components/culling/CulledAlbumNoResults';
import {CulledAlbumPhotoGrid} from '@components/culling/CulledAlbumPhotoGrid';
import type {FilterSummary} from '@lib/culling/filterSummary';
import {colors} from '@lib/ui/colors';
import {sansBoldStyle} from '@lib/ui/typography';
import type {ComponentProps} from 'react';
import {StyleSheet, Text, View} from 'react-native';

type Sections = ComponentProps<typeof CulledAlbumPhotoGrid>['sections'];

const SIMILAR_NOTE = 'All alternatives are included in similar-shot groups.';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function summarizeSections(
  sections: Sections,
  labels: readonly string[] = sections ? ['Similar Shots'] : [],
  photoCount = 0,
): string | null {
  if (!sections) {
    return labels.length === 0
      ? null
      : `Showing: ${labels.join(' + ')} · ${plural(photoCount, 'photo')}`;
  }
  const groups = sections.filter(section => section.isGroup).length;
  const photos = sections.reduce((sum, s) => sum + s.photoIds.length, 0);
  return `Showing: ${labels.join(' + ')} · ${plural(groups, 'group')} · ${plural(photos, 'photo')}`;
}

type Props = ComponentProps<typeof CulledAlbumPhotoGrid> & {
  filter: FilterSummary & {onClear: () => void; noResults: boolean};
};

/** The grid plus the "Showing: ..." line, Clear filters and no-results state. */
export function CulledAlbumGridWithSummary({filter, ...props}: Props) {
  const summary = summarizeSections(
    props.sections,
    filter.labels,
    props.photos.length,
  );
  return (
    <View style={styles.container}>
      {summary && (
        <View style={styles.row}>
          <Text accessibilityRole="summary" style={styles.summary}>
            {summary}
          </Text>
          {filter.noResults ? null : (
            <>
              {filter.showSimilarNote ? (
                <Text style={styles.note}>{SIMILAR_NOTE}</Text>
              ) : (
                <View style={styles.spacer} />
              )}
              <ClearFiltersButton onPress={filter.onClear} />
            </>
          )}
        </View>
      )}
      {filter.noResults ? (
        <CulledAlbumNoResults onClear={filter.onClear} />
      ) : (
        <CulledAlbumPhotoGrid {...props} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 8,
    paddingRight: 24,
  },
  summary: {
    ...sansBoldStyle,
    color: colors.textMuted,
    fontSize: 12,
    flexShrink: 1,
  },
  spacer: {flex: 1},
  note: {
    ...sansBoldStyle,
    color: colors.textMuted,
    fontSize: 12,
    flex: 1,
    textAlign: 'right',
  },
});
