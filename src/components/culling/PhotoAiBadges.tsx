import { SimilarShotsBadge } from '@components/culling/SimilarShotsBadge';
import type { CulledAlbumPhoto } from '@lib/culledAlbum/types';
import { colors } from '@lib/ui/colors';
import { sansBoldStyle } from '@lib/ui/typography';
import { StyleSheet, Text, View } from 'react-native';

type BadgeFlags = Pick<
  CulledAlbumPhoto,
  'aiSelected' | 'maybe' | 'closedEyes' | 'blurred'
>;

type PhotoAiBadgesProps = {
  flags: BadgeFlags;
  similarShotCount?: number;
  onOpenDetail: () => void;
};

type BadgeSpec = { label: string; tone: 'ai' | 'warning' };

const WARNING_TEXT = '#FFD700';

/** Badges in display order: AI recommended, status (eyes before sharpness). */
export function listPhotoBadges(flags: BadgeFlags): BadgeSpec[] {
  const badges: BadgeSpec[] = [];
  if (flags.aiSelected) {
    badges.push({ label: 'AI recommended', tone: 'ai' });
  }
  if (flags.maybe) {
    badges.push({ label: 'Needs review', tone: 'warning' });
  }
  if (flags.closedEyes) {
    badges.push({ label: 'Check eyes', tone: 'warning' });
  }
  if (flags.blurred) {
    badges.push({ label: 'Check sharpness', tone: 'warning' });
  }
  return badges;
}

/** One badge shows; the rest collapse into a non-interactive "+N" pill. */
export function PhotoAiBadges({
  flags,
  similarShotCount,
  onOpenDetail,
}: PhotoAiBadgesProps) {
  const badges = listPhotoBadges(flags);
  const [first] = badges;
  if (!first) {
    return similarShotCount == null ? null : (
      <SimilarShotsBadge count={similarShotCount} onPress={onOpenDetail} />
    );
  }
  const hidden = badges.length - 1 + (similarShotCount == null ? 0 : 1);
  return (
    <View pointerEvents="none" style={styles.row}>
      <View
        accessible
        accessibilityLabel={first.label}
        style={[styles.chip, first.tone === 'ai' && styles.chipAi]}
      >
        <Text
          style={[
            styles.label,
            first.tone === 'warning' && styles.labelWarning,
          ]}
        >
          {first.label}
        </Text>
      </View>
      {hidden > 0 && (
        <View
          accessible
          accessibilityLabel={`${hidden} more badges`}
          style={styles.chip}
        >
          <Text style={styles.label}>{`+${hidden}`}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    position: 'absolute',
    left: 16,
    bottom: 8,
    flexDirection: 'row',
    gap: 4,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 100,
    backgroundColor: 'rgba(19,20,21,0.75)',
  },
  chipAi: {
    backgroundColor: colors.blue,
  },
  label: {
    ...sansBoldStyle,
    color: colors.text,
    fontSize: 12,
  },
  labelWarning: {
    color: WARNING_TEXT,
  },
});
