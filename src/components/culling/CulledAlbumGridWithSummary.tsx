import {CulledAlbumPhotoGrid} from '@components/culling/CulledAlbumPhotoGrid';
import {colors} from '@lib/ui/colors';
import {sansBoldStyle} from '@lib/ui/typography';
import type {ComponentProps} from 'react';
import {StyleSheet, Text, View} from 'react-native';

export function summarizeSections(
  sections: ComponentProps<typeof CulledAlbumPhotoGrid>['sections'],
): string | null {
  if (!sections) {
    return null;
  }
  const groups = sections.filter(section => section.isGroup).length;
  const photos = sections.reduce((sum, s) => sum + s.photoIds.length, 0);
  return `Showing: Similar Shots · ${groups} ${groups === 1 ? 'group' : 'groups'} · ${photos} ${photos === 1 ? 'photo' : 'photos'}`;
}

/** The grid plus the "Showing: Similar Shots" line that goes with sections. */
export function CulledAlbumGridWithSummary(
  props: ComponentProps<typeof CulledAlbumPhotoGrid>,
) {
  const summary = summarizeSections(props.sections);
  return (
    <View style={styles.container}>
      {summary && (
        <Text accessibilityRole="summary" style={styles.summary}>
          {summary}
        </Text>
      )}
      <CulledAlbumPhotoGrid {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  summary: {
    ...sansBoldStyle,
    color: colors.textMuted,
    fontSize: 12,
    paddingBottom: 8,
  },
});
