import { Pressable } from '@components/ui';
import type { AiSelectionLevel } from '@domain/valueObjects/AiSelection';
import { colors } from '@lib/ui/colors';
import { fonts, sansBoldStyle } from '@lib/ui/typography';
import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import IconCloseCircle from '../../assets/images/icon_close_circle.svg';
import IconError from '../../assets/images/icon_error_info.svg';
import { LEVEL_LABELS } from './AiSelectionSection';

const AUTO_DISMISS_MS = 5000;
const FAILED_TITLE = "Couldn't update recommendations";
const FAILED_DETAIL = 'Previous results kept';
export const UPDATED_TOAST_WIDTH = 544;
export const FAILED_TOAST_WIDTH = 552;

export type AiSelectionToastProps =
  | {
      variant: 'updated';
      level: AiSelectionLevel;
      count: number;
      onDismiss: () => void;
    }
  | { variant: 'failed'; onDismiss: () => void };

function getCopy(props: AiSelectionToastProps) {
  if (props.variant === 'failed') {
    return { title: FAILED_TITLE, detail: FAILED_DETAIL };
  }
  const noun = props.count === 1 ? 'photo' : 'photos';
  return {
    title: `Recommendations updated · ${LEVEL_LABELS[props.level]}`,
    detail: `${props.count} recommended ${noun}. Your picked photos are unchanged.`,
  };
}

export function AiSelectionToast(props: AiSelectionToastProps) {
  const { onDismiss } = props;
  const { title, detail } = getCopy(props);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`${title}. ${detail}`);
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [title, detail, onDismiss]);

  const closeButton = (
    <Pressable
      onPress={onDismiss}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel="Dismiss"
    >
      <IconCloseCircle width={20} height={20} />
    </Pressable>
  );

  if (props.variant === 'failed') {
    return (
      <View style={[styles.container, { width: FAILED_TOAST_WIDTH }]}>
        <View style={styles.row}>
          <IconError width={16} height={16} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.detail}>{detail}</Text>
        </View>
        {closeButton}
      </View>
    );
  }

  return (
    <View style={[styles.container, { width: UPDATED_TOAST_WIDTH }]}>
      <View style={styles.stack}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.detail}>{detail}</Text>
      </View>
      {closeButton}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: colors.white,
    paddingHorizontal: 32,
    paddingTop: 20,
    paddingBottom: 24,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stack: { gap: 4 },
  title: {
    ...sansBoldStyle,
    fontSize: 16,
    lineHeight: 16,
    color: colors.textDark,
  },
  detail: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 16,
    color: colors.textDark,
  },
});
