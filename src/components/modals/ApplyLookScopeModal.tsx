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
import IconClose from '../../assets/images/icon_close.svg';
import { focusDesktopNode } from './focusDesktopNode';
import { ModalDecorations } from './ModalDecorations';

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
// 20 high text + 12 + 12 = 44 point target without growing the button.
const TEXT_BUTTON_HIT_SLOP = { top: 12, bottom: 12, left: 0, right: 0 };
const CLOSE_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };
const HANDLED_BUBBLING = 3;

const escapeKeyDownEvents =
  Platform.OS === 'windows'
    ? [{ code: 'Escape', handledEventPhase: HANDLED_BUBBLING }]
    : [{ key: 'Escape' }];

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
        <ModalDecorations />
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
              hitSlop={TEXT_BUTTON_HIT_SLOP}
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
          hitSlop={CLOSE_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <IconClose width={24} height={24} color={colors.textDark} />
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
    top: 24,
    right: 24,
    zIndex: 3,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
