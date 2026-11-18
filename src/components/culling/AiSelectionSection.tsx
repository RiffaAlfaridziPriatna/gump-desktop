import { focusDesktopNode } from '@components/modals/focusDesktopNode';
import { Pressable } from '@components/ui';
import {
  AI_SELECTION_LEVELS,
  type AiSelectionLevel,
} from '@domain/valueObjects/AiSelection';
import type { AiSelectionStatus } from '@hooks/useAiSelectionFlow';
import { colors } from '@lib/ui/colors';
import { fonts, interSemiBoldStyle, sansSemiBoldStyle } from '@lib/ui/typography';
import { useCallback, useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import IconLoader from '../../assets/images/lucide_loader_circle.svg';
import IconSparkles from '../../assets/images/lucide_sparkles.svg';

export const LEVEL_LABELS: Record<AiSelectionLevel, string> = {
  fewer: 'Fewer',
  balanced: 'Balanced',
  more: 'More',
};

const LEVEL_HELP: Record<AiSelectionLevel, string> = {
  fewer: 'Only the best shots',
  balanced: 'Balance quality, variety and coverage.',
  more: 'A broader selection',
};

const HANDLED_BUBBLING = 3;
const ARROW_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'] as const;

const arrowKeyDownEvents =
  Platform.OS === 'windows'
    ? ARROW_KEYS.map(code => ({ code, handledEventPhase: HANDLED_BUBBLING }))
    : ARROW_KEYS.map(key => ({ key }));

function arrowStep(name: string | undefined): number {
  if (name === 'ArrowRight' || name === 'ArrowDown') {
    return 1;
  }
  return name === 'ArrowLeft' || name === 'ArrowUp' ? -1 : 0;
}

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
  const segmentRefs = useRef<Record<string, View | null>>({});
  const pendingFocusRef = useRef(false);
  const buttonRef = useRef<View | null>(null);
  const buttonFocusedRef = useRef(false);
  const wasUpdatingRef = useRef(false);

  useEffect(() => {
    if (pendingFocusRef.current) {
      pendingFocusRef.current = false;
      focusDesktopNode(segmentRefs.current[draftLevel] ?? null);
    }
  }, [draftLevel]);

  useEffect(() => {
    if (updating && !wasUpdatingRef.current) {
      AccessibilityInfo.announceForAccessibility('Updating recommendations');
    }
    if (!updating && wasUpdatingRef.current && buttonFocusedRef.current) {
      focusDesktopNode(buttonRef.current);
    }
    wasUpdatingRef.current = updating;
  }, [updating]);

  const handleKeyDown = useCallback(
    (event: unknown) => {
      if (updating) {
        return;
      }
      const native = (
        event as { nativeEvent?: { key?: string; code?: string } }
      ).nativeEvent;
      const step = arrowStep(native?.key ?? native?.code);
      if (step === 0) {
        return;
      }
      const count = AI_SELECTION_LEVELS.length;
      const index = AI_SELECTION_LEVELS.indexOf(draftLevel);
      pendingFocusRef.current = true;
      onLevelChange(AI_SELECTION_LEVELS[(index + step + count) % count]!);
    },
    [updating, draftLevel, onLevelChange],
  );

  return (
    <View style={styles.root}>
      <View style={styles.captionRow}>
        <IconSparkles width={16} height={16} color={colors.white} />
        <Text style={styles.caption} accessibilityRole="header">
          AI Selection
        </Text>
      </View>
      <View
        style={styles.segments}
        accessibilityRole="radiogroup"
        accessibilityLabel="AI Selection"
        onKeyDown={handleKeyDown}
        keyDownEvents={arrowKeyDownEvents}
      >
        {AI_SELECTION_LEVELS.map(level => {
          const selected = level === draftLevel;
          return (
            <Pressable
              key={level}
              // The ui wrapper forwards unknown props; React 19 passes ref as a prop.
              {...{
                ref: (node: View | null) => {
                  segmentRefs.current[level] = node;
                },
              }}
              focusable={selected}
              onPress={() => onLevelChange(level)}
              disabled={updating}
              style={[styles.segment, selected && styles.segmentSelected]}
              accessibilityRole="radio"
              accessibilityLabel={LEVEL_LABELS[level]}
              accessibilityState={{ selected, disabled: updating }}
            >
              <Text
                style={styles.segmentText}
              >
                {LEVEL_LABELS[level]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.help}>{LEVEL_HELP[draftLevel]}</Text>
      <Pressable
        {...{ ref: buttonRef }}
        onFocus={() => {
          buttonFocusedRef.current = true;
        }}
        onBlur={() => {
          // Disabling the button blurs it; keep the flag for focus return.
          if (!updating) {
            buttonFocusedRef.current = false;
          }
        }}
        onPress={onUpdate}
        disabled={updating}
        style={[styles.button, updating && styles.buttonUpdating]}
        accessibilityRole="button"
        accessibilityLabel={
          updating ? 'Updating recommendations' : 'Update recommendations'
        }
        accessibilityState={{ disabled: updating, busy: updating }}
      >
        {updating && <IconLoader width={16} height={16} />}
        <Text numberOfLines={1} style={styles.buttonText}>
          {updating ? 'Updating…' : 'Update recommendations'}
        </Text>
      </Pressable>
      {updating && (
        <Text
          style={styles.note}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
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
  root: { gap: 10, paddingHorizontal: 12 },
  captionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  caption: {
    ...sansSemiBoldStyle,
    fontSize: 16,
    color: colors.white,
  },
  segments: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Fixed height + tight lineHeight: a tall line box sinks text on Windows.
  segment: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentSelected: {
    borderWidth: 0,
    backgroundColor: colors.accent,
  },
  segmentText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 18,
    color: colors.white,
    textAlign: 'center',
  },
  help: { fontFamily: fonts.sans, fontSize: 13, color: colors.white },
  button: {
    height: 40,
    paddingHorizontal: 8,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    overflow: 'hidden',
  },
  buttonUpdating: { opacity: 0.6 },
  buttonText: { ...interSemiBoldStyle, fontSize: 14, color: colors.accent },
  note: { fontFamily: fonts.sans, fontSize: 12, color: colors.textMuted },
});
