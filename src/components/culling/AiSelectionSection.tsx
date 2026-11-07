import {Pressable} from '@components/ui';
import {
  AI_SELECTION_LEVELS,
  type AiSelectionLevel,
} from '@domain/valueObjects/AiSelection';
import type {AiSelectionStatus} from '@hooks/useAiSelectionFlow';
import {colors} from '@lib/ui/colors';
import {fonts, sansBoldStyle} from '@lib/ui/typography';
import {StyleSheet, Text, View} from 'react-native';
import IconLoader from '../../assets/images/lucide_loader_circle.svg';
import IconSparkles from '../../assets/images/lucide_sparkles.svg';

const LEVEL_LABELS: Record<AiSelectionLevel, string> = {
  fewer: 'Fewer',
  balanced: 'Balanced',
  more: 'More',
};

const LEVEL_HELP: Record<AiSelectionLevel, string> = {
  fewer: 'Only the best shots',
  balanced: 'Balance quality, variety and coverage.',
  more: 'A broader selection',
};

export type AiSelectionSectionProps = {
  draftLevel: AiSelectionLevel;
  status: AiSelectionStatus;
  onLevelChange: (level: AiSelectionLevel) => void;
  onUpdate: () => void;
};

export function AiSelectionSection({
  draftLevel,
  status,
  onLevelChange,
  onUpdate,
}: AiSelectionSectionProps) {
  const updating = status === 'updating';

  return (
    <View style={styles.root}>
      <View style={styles.captionRow}>
        <IconSparkles width={16} height={16} color={colors.white} />
        <Text style={styles.caption} accessibilityRole="header">
          AI Selection
        </Text>
      </View>
      <View style={styles.segments} accessibilityRole="radiogroup">
        {AI_SELECTION_LEVELS.map(level => {
          const selected = level === draftLevel;
          return (
            <Pressable
              key={level}
              onPress={() => onLevelChange(level)}
              disabled={updating}
              style={[styles.segment, selected && styles.segmentSelected]}
              accessibilityRole="radio"
              accessibilityLabel={LEVEL_LABELS[level]}
              accessibilityState={{selected, disabled: updating}}>
              <Text
                style={[styles.segmentText, selected && styles.segmentTextSel]}>
                {LEVEL_LABELS[level]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.help}>{LEVEL_HELP[draftLevel]}</Text>
      <Pressable
        onPress={onUpdate}
        disabled={updating}
        style={[styles.button, updating && styles.buttonUpdating]}
        accessibilityRole="button"
        accessibilityLabel={
          updating ? 'Updating recommendations' : 'Update recommendations'
        }
        accessibilityState={{disabled: updating, busy: updating}}>
        {updating && <IconLoader width={16} height={16} />}
        <Text style={styles.buttonText}>
          {updating ? 'Updating…' : 'Update recommendations'}
        </Text>
      </Pressable>
      {updating && (
        <Text style={styles.note} accessibilityLiveRegion="polite">
          Updating recommendations…
        </Text>
      )}
      <Text style={styles.note}>
        Changes AI recommendations only. Your picked photos stay unchanged.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {gap: 10, paddingHorizontal: 12},
  captionRow: {flexDirection: 'row', alignItems: 'center', gap: 8},
  caption: {
    fontFamily: fonts.sans,
    fontWeight: '600',
    fontSize: 16,
    color: colors.white,
  },
  segments: {flexDirection: 'row', alignItems: 'center', gap: 6},
  segment: {
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: {
    paddingVertical: 5,
    borderWidth: 0,
    backgroundColor: colors.accent,
  },
  segmentText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 22.4,
    color: colors.white,
    textAlign: 'center',
  },
  segmentTextSel: {lineHeight: 19.6},
  help: {fontFamily: fonts.sans, fontSize: 13, color: colors.white},
  button: {
    height: 40,
    paddingHorizontal: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  buttonUpdating: {opacity: 0.6},
  // Inter Semi Bold is not bundled; sansBold stands in until the font is added.
  buttonText: {...sansBoldStyle, fontSize: 14, color: colors.accent},
  note: {fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted},
});
