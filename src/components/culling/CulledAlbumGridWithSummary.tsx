import {
  ClearFiltersButton,
  CulledAlbumNoResults,
} from '@components/culling/CulledAlbumNoResults';
import {CulledAlbumPhotoGrid} from '@components/culling/CulledAlbumPhotoGrid';
import type {FilterSummary} from '@lib/culling/filterSummary';
import {colors} from '@lib/ui/colors';
import {fonts, interSemiBoldStyle, sansBoldStyle} from '@lib/ui/typography';
import type {ComponentProps} from 'react';
import {StyleSheet, Text, View} from 'react-native';

type Sections = ComponentProps<typeof CulledAlbumPhotoGrid>['sections'];

const SIMILAR_NOTE = 'All alternatives are included in similar-shot groups.';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function summaryParts(
  sections: Sections,
  labels: readonly string[] = sections ? ['Similar Shots'] : [],
  photoCount = 0,
): {labels: string; tail: string} | null {
  if (!sections) {
    return labels.length === 0
      ? null
      : {labels: labels.join(' + '), tail: `· ${plural(photoCount, 'photo')}`};
  }
  const groups = sections.filter(section => section.isGroup).length;
  const photos = sections.reduce((sum, s) => sum + s.photoIds.length, 0);
  return {
    labels: labels.join(' + '),
    tail: `· ${plural(groups, 'group')} · ${plural(photos, 'photo')}`,
  };
}

export function summarizeSections(
  sections: Sections,
  labels: readonly string[] = sections ? ['Similar Shots'] : [],
  photoCount = 0,
): string | null {
  const parts = summaryParts(sections, labels, photoCount);
  return parts && `Showing: ${parts.labels} ${parts.tail}`;
}

type Props = ComponentProps<typeof CulledAlbumPhotoGrid> & {
  filter: FilterSummary & {onClear: () => void; noResults: boolean};
};

/** The grid plus the "Showing: ..." line, Clear filters and no-results state. */
export function CulledAlbumGridWithSummary({filter, ...props}: Props) {
  const parts = summaryParts(props.sections, filter.labels, props.photos.length);
  const summary = summarizeSections(
    props.sections,
    filter.labels,
    props.photos.length,
  );
  return (
    <View style={styles.container}>
      {summary && parts && (
        <View style={styles.row}>
          <View
            accessible
            accessibilityRole="summary"
            accessibilityLabel={summary}
            style={styles.summary}>
            <Text style={styles.summaryMuted}>Showing:</Text>
            <Text style={styles.summaryLabel}>{parts.labels}</Text>
            <Text style={styles.summaryMuted}>{parts.tail}</Text>
          </View>
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
  summary: {flexDirection: 'row', alignItems: 'center', gap: 12, flexShrink: 1},
  summaryMuted: {fontFamily: fonts.sans, color: colors.textMuted, fontSize: 14},
  summaryLabel: {...interSemiBoldStyle, color: colors.white, fontSize: 14},
  spacer: {flex: 1},
  note: {
    ...sansBoldStyle,
    color: colors.textMuted,
    fontSize: 12,
    flex: 1,
    textAlign: 'right',
  },
});
