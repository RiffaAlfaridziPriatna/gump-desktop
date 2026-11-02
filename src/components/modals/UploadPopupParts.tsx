import {Pressable} from '@components/ui';
import {colors} from '@lib/ui/colors';
import {fonts, sansBoldStyle} from '@lib/ui/typography';
import {useEffect, useRef, type ReactNode} from 'react';
import {AccessibilityInfo, StyleSheet, Text, View} from 'react-native';
import {focusDesktopNode} from './focusDesktopNode';

/** Decorative icon: hidden from screen readers. */
export function PopupIcon({children}: {children: ReactNode}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      {children}
    </View>
  );
}

/** Title block; announces itself once per mount and is an assertive live region. */
export function PopupTitleBlock({
  title,
  subtitle,
  extra,
  urgent = false,
}: {
  title: string;
  subtitle?: string;
  /** Extra text only announced (the banner message). */
  extra?: string;
  /** Failure or blocking state: alert role with an assertive live region. */
  urgent?: boolean;
}) {
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      [title, subtitle, extra]
        .filter(Boolean)
        .map(part => part!.replace(/\.$/, ''))
        .join('. '),
    );
  }, [title, subtitle, extra]);

  return (
    <View
      style={styles.titleBlock}
      accessibilityRole={urgent ? 'alert' : 'header'}
      accessibilityLiveRegion={urgent ? 'assertive' : 'polite'}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

type PopupButtonProps = {
  label: string;
  variant: 'primary' | 'secondary' | 'text';
  onPress: () => void;
  /** Focus this button on mount (desktop keyboard users). */
  autoFocus?: boolean;
  disabled?: boolean;
  accessibilityHint?: string;
  /** Primary button that keeps its content width instead of stretching. */
  single?: boolean;
};

export function PopupButton({
  label,
  variant,
  onPress,
  autoFocus,
  disabled,
  accessibilityHint,
  single,
}: PopupButtonProps) {
  const ref = useRef<View | null>(null);

  useEffect(() => {
    if (autoFocus) {
      focusDesktopNode(ref.current);
    }
    // Focus once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Pressable
      // The ui wrapper forwards unknown props; React 19 passes ref as a prop.
      {...{ref}}
      style={({pressed}) => [
        styles.button,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'text' && styles.textButton,
        single && styles.single,
        (pressed || disabled) && styles.dimmed,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{disabled: Boolean(disabled)}}>
      <Text
        style={[
          styles.label,
          variant === 'primary' && styles.primaryLabel,
          variant !== 'primary' && styles.accentLabel,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

export const popupStyles = StyleSheet.create({
  content: {
    width: 480,
    maxWidth: '100%',
    gap: 24,
    alignItems: 'center',
  },
  fullWidth: {
    width: '100%',
    gap: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    width: 456,
    maxWidth: '100%',
    justifyContent: 'center',
  },
  buttonColumn: {
    gap: 12,
    width: 456,
    maxWidth: '100%',
    alignItems: 'stretch',
  },
});

const styles = StyleSheet.create({
  titleBlock: {
    gap: 12,
    alignItems: 'center',
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    lineHeight: 28 * 1.2,
    color: colors.textDark,
    textAlign: 'center',
    fontWeight: '400',
  },
  subtitle: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 14 * 1.44,
    color: colors.textMuted,
    textAlign: 'center',
    fontWeight: '400',
  },
  button: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    paddingHorizontal: 32,
    paddingVertical: 8,
  },
  secondary: {
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 32,
    paddingVertical: 8,
  },
  textButton: {
    flex: 0,
    minHeight: 44,
  },
  single: {
    flex: 0,
  },
  dimmed: {
    opacity: 0.8,
  },
  label: {
    ...sansBoldStyle,
    fontSize: 16,
    lineHeight: 16 * 1.6,
  },
  primaryLabel: {
    color: colors.white,
  },
  accentLabel: {
    color: colors.accent,
  },
});
