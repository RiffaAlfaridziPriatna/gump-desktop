import { Modal, Pressable } from '@components/ui';
import { colors } from '@lib/ui/colors';
import { fonts, sansBoldStyle } from '@lib/ui/typography';
import { useCallback, useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import CircleBlue from '../../assets/images/upload/blue_circle.svg';
import HalfCircle from '../../assets/images/upload/half_circle.svg';
import CircleLightBlue from '../../assets/images/upload/light_blue_circle.svg';
import QuarterCircleOrange from '../../assets/images/upload/orange_quarter_circle.svg';
import QuarterCircleRed from '../../assets/images/upload/red_quarter_circle.svg';
import IconClose from '../../assets/images/icon_close.svg';
import { focusDesktopNode } from './focusDesktopNode';

type ApplyLookScopeModalProps = {
  visible: boolean;
  lookLabel: string;
  onApplyAll: () => void;
  onApplyNewOnly: () => void;
  onClose: () => void;
};

const TITLE = 'Apply this new look to existing photos too?';
// Figma GumpLight/Grey4; no matching token in colors.ts.
const BODY_COLOR = '#454545';
const HANDLED_BUBBLING = 3;

const escapeKeyDownEvents =
  Platform.OS === 'windows'
    ? [{ code: 'Escape', handledEventPhase: HANDLED_BUBBLING }]
    : [{ key: 'Escape' }];

function Decorations() {
  return (
    <View
      style={styles.decorations}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <QuarterCircleRed style={styles.quarterRedDecor} width={80} height={80} />
      <CircleBlue style={styles.circleBlueDecor} width={32} height={32} />
      <HalfCircle style={styles.halfCircleDecor} width={72} />
      <QuarterCircleOrange
        style={styles.quarterOrangeDecor}
        width={98}
        height={98}
      />
      <CircleLightBlue
        style={styles.circleLightBlueDecor}
        width={36}
        height={36}
      />
    </View>
  );
}

export function ApplyLookScopeModal({
  visible,
  lookLabel,
  onApplyAll,
  onApplyNewOnly,
  onClose,
}: ApplyLookScopeModalProps) {
  const primaryRef = useRef<View | null>(null);
  const focusedRef = useRef(false);
  const body = `${lookLabel} applies to future uploads.`;

  // The ui Modal mounts its content one commit after `visible` flips, so focus
  // from the ref callback too, once the primary button exists.
  const focusPrimary = useCallback(() => {
    if (focusedRef.current || !primaryRef.current) {
      return;
    }
    focusedRef.current = true;
    focusDesktopNode(primaryRef.current);
  }, []);
  const setPrimaryRef = useCallback(
    (node: View | null) => {
      primaryRef.current = node;
      if (node && visibleRef.current) {
        focusPrimary();
      }
    },
    [focusPrimary],
  );
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    if (visible) {
      focusPrimary();
    } else {
      focusedRef.current = false;
    }
  }, [visible, focusPrimary]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    AccessibilityInfo.announceForAccessibility(`${TITLE} ${body}`);
  }, [visible, body]);

  const handleKeyDown = useCallback(
    (event: unknown) => {
      const native = (
        event as { nativeEvent?: { key?: string; code?: string } }
      ).nativeEvent;
      if (native?.key === 'Escape' || native?.code === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      width={720}
      height={456}
      showCloseButton={false}
      contentStyle={styles.modalContent}
    >
      <View
        style={styles.card}
        onKeyDown={handleKeyDown}
        keyDownEvents={escapeKeyDownEvents}
      >
        <Decorations />
        <View style={styles.content}>
          <View style={styles.textBlock}>
            <Text style={styles.title} accessibilityRole="header">
              {TITLE}
            </Text>
            <Text style={styles.body}>{body}</Text>
          </View>
          <View style={styles.actions}>
            <Pressable
              // The ui wrapper forwards unknown props; React 19 passes ref as a prop.
              {...{ ref: setPrimaryRef }}
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && styles.pressed,
              ]}
              onPress={onApplyAll}
              accessibilityRole="button"
              accessibilityLabel="All album photos"
            >
              <Text style={styles.primaryButtonText}>All album photos</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && styles.pressed,
              ]}
              onPress={onApplyNewOnly}
              accessibilityRole="button"
              accessibilityLabel="New photos only"
            >
              <Text style={styles.secondaryButtonText}>New photos only</Text>
            </Pressable>
          </View>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.closeButton,
            pressed && styles.pressed,
          ]}
          onPress={onClose}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <IconClose width={20} height={20} color={colors.textDark} />
          </View>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  decorations: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    width: 480,
    alignItems: 'center',
    gap: 24,
  },
  textBlock: {
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    lineHeight: 28 * 1.2,
    color: colors.textDark,
    textAlign: 'center',
    fontWeight: '400',
  },
  body: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 16 * 1.4,
    color: BODY_COLOR,
    textAlign: 'center',
  },
  actions: {
    gap: 12,
    alignItems: 'center',
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    paddingHorizontal: 32,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    ...sansBoldStyle,
    fontSize: 16,
    lineHeight: 16 * 1.6,
    color: colors.white,
  },
  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 14 * 1.44,
    color: colors.textMuted,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 3,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halfCircleDecor: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  quarterOrangeDecor: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  quarterRedDecor: {
    position: 'absolute',
    bottom: 0,
    right: 0,
  },
  circleBlueDecor: {
    position: 'absolute',
    bottom: 24,
    left: 24,
  },
  circleLightBlueDecor: {
    position: 'absolute',
    top: 80,
    right: 0,
  },
});
