import {Pressable} from '@components/ui';
import {formatGigabytes} from '@lib/export/formatByteSize';
import type {ExportFailureReason} from '@lib/export/types';
import {colors} from '@lib/ui/colors';
import {fonts, sansBoldStyle} from '@lib/ui/typography';
import {useEffect, useRef} from 'react';
import {AccessibilityInfo, StyleSheet, Text, View} from 'react-native';
import {focusDesktopNode} from './focusDesktopNode';
import IconError from '../../assets/images/icon_error.svg';

export type ExportFailureViewProps = {
  reason: ExportFailureReason;
  /** Which step failed; steers the generic copy and the secondary action. */
  failedStep: 'prepare' | 'download';
  requiredBytes?: number;
  missingCount?: number;
  onTryAgain: () => void;
  onChangeSaveLocation: () => void;
  onCancel: () => void;
};

type FailureCopy = {title: string; subtitle: string};

function describeFailure({
  reason,
  failedStep,
  requiredBytes,
  missingCount,
}: ExportFailureViewProps): FailureCopy {
  switch (reason) {
    case 'diskFull':
      return {
        title: 'Not enough space on this computer',
        subtitle:
          requiredBytes != null
            ? `This export needs ${formatGigabytes(requiredBytes)}. Free up space or choose another location.`
            : 'Free up space or choose another location.',
      };
    case 'folderNotWritable':
      return {
        title: "Can't save to this folder",
        subtitle: "Choose another location or check the folder's permissions.",
      };
    case 'sourceMissing':
      return missingCount === 1
        ? {
            title: '1 source file is missing',
            subtitle: 'It was moved or deleted. Reconnect it and try again.',
          }
        : {
            title:
              missingCount != null
                ? `${missingCount} source files are missing`
                : 'Source files are missing',
            subtitle: 'They were moved or deleted. Reconnect them and try again.',
          };
    default:
      return failedStep === 'prepare'
        ? {
            title: 'Export failed',
            subtitle: 'Something went wrong while preparing your ZIP.',
          }
        : {
            title: 'Download failed',
            subtitle: 'Your export is still ready — nothing was lost.',
          };
  }
}

export function ExportFailureView(props: ExportFailureViewProps) {
  const {reason, failedStep, onTryAgain, onChangeSaveLocation, onCancel} =
    props;
  const {title, subtitle} = describeFailure(props);
  const primaryRef = useRef<View | null>(null);
  // Saving can be redirected only after the ZIP exists. Before that, disk and
  // folder failures offer Cancel; sourceMissing always does.
  const showChangeLocation =
    reason !== 'sourceMissing' && failedStep === 'download';
  const showCancel =
    reason === 'sourceMissing' ||
    (failedStep === 'prepare' &&
      (reason === 'diskFull' || reason === 'folderNotWritable'));
  const isSingleAction = !showChangeLocation && !showCancel;

  useEffect(() => {
    focusDesktopNode(primaryRef.current);
    AccessibilityInfo.announceForAccessibility(`${title}. ${subtitle}`);
    // Announce once per failure view mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.content}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants">
        <IconError width={40} height={40} />
      </View>
      <View
        style={styles.titleBlock}
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive">
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable
          // The ui wrapper forwards unknown props; React 19 passes ref as a prop.
          {...{ref: primaryRef}}
          style={({pressed}) => [
            styles.primaryButton,
            isSingleAction && styles.singlePrimary,
            pressed && styles.pressed,
          ]}
          onPress={onTryAgain}
          accessibilityRole="button"
          accessibilityLabel="Try again">
          <Text style={styles.primaryButtonText}>Try again</Text>
        </Pressable>
        {showChangeLocation ? (
          <Pressable
            style={({pressed}) => [styles.secondaryButton, pressed && styles.pressed]}
            onPress={onChangeSaveLocation}
            accessibilityRole="button"
            accessibilityLabel="Change save location">
            <Text style={styles.secondaryButtonText}>Change save location</Text>
          </Pressable>
        ) : null}
        {showCancel ? (
          <Pressable
            style={({pressed}) => [styles.secondaryButton, pressed && styles.pressed]}
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel">
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    width: 480,
  },
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
  actions: {
    flexDirection: 'row',
    gap: 12,
    width: 456,
    justifyContent: 'center',
  },
  primaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    paddingHorizontal: 32,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.8,
  },
  singlePrimary: {
    flex: 0,
  },
  primaryButtonText: {
    ...sansBoldStyle,
    fontSize: 16,
    color: colors.white,
  },
  secondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 32,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    ...sansBoldStyle,
    fontSize: 16,
    color: colors.accent,
  },
});
