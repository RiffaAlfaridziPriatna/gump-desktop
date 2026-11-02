import { SimilarShotsBadge } from '@components/culling/SimilarShotsBadge';
import type { CulledAlbumPhoto } from '@lib/culledAlbum/types';
import { colors } from '@lib/ui/colors';
import { sansBoldStyle } from '@lib/ui/typography';
import { Pressable } from '@components/ui';
import { Image, StyleSheet, Text, View } from 'react-native';

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

const BADGE_ICONS: Record<string, number> = {
  'AI recommended': require('../../assets/images/lucide_sparkles_512.png'),
  'Needs review': require('../../assets/images/lucide_circle_help_512.png'),
  'Check sharpness': require('../../assets/images/lucide_focus_512.png'),
  'Check eyes': require('../../assets/images/lucide_eye_off_512.png'),
};

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

/** One badge shows; the rest collapse into a "+N" pill that opens the viewer when grouped. */
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
  const grouped = similarShotCount != null;
  const hiddenLabels = badges.slice(1).map(b => b.label);
  if (grouped) {
    hiddenLabels.push(`${similarShotCount} similar shots`);
  }
  const hidden = hiddenLabels.length;
  const moreLabel = `${hidden} more: ${hiddenLabels.join(', ')}`;
  return (
    <View pointerEvents="box-none" style={styles.row}>
      <View
        accessible
        accessibilityLabel={first.label}
        style={[styles.chip, styles.chipIcon, first.tone === 'ai' && styles.chipAi]}
      >
        <Image
          accessible={false}
          source={BADGE_ICONS[first.label]}
          style={[
            styles.icon,
            { tintColor: first.tone === 'warning' ? WARNING_TEXT : colors.text },
          ]}
        />
        <Text
          style={[
            styles.label,
            first.tone === 'warning' && styles.labelWarning,
          ]}
        >
          {first.label}
        </Text>
      </View>
      {hidden > 0 &&
        (grouped ? (
          <Pressable
            style={styles.chip}
            onPress={event => {
              event.stopPropagation();
              onOpenDetail();
            }}
            accessibilityRole="button"
            focusable
            accessibilityLabel={`${moreLabel}, open viewer`}
          >
            <Text style={styles.label}>{`+${hidden}`}</Text>
          </Pressable>
        ) : (
          <View accessible accessibilityLabel={moreLabel} style={styles.chip}>
            <Text style={styles.label}>{`+${hidden}`}</Text>
          </View>
        ))}
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
  chipIcon: {
    paddingLeft: 24,
  },
  icon: {
    position: 'absolute',
    left: 8,
    top: '50%',
    marginTop: -6,
    width: 12,
    height: 12,
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
