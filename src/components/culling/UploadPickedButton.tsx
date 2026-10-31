import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {Pressable} from '@components/ui';
import {colors} from '@lib/ui/colors';
import {fonts, sansBoldStyle} from '@lib/ui/typography';
import IconCheckCircle from '../../assets/images/icon_check_circle.svg';
import IconInfo from '../../assets/images/icon_info.svg';
import IconUpload from '../../assets/images/icon_upload.svg';

const NOTE_HINT = 'Includes picked photos outside this view.';

type UploadPickedButtonProps = {
  pickedCount: number;
  uploaded: boolean;
  disabled: boolean;
  includesHidden: boolean;
  onPress: () => void;
};

export function UploadPickedButton({
  pickedCount,
  uploaded,
  disabled,
  includesHidden,
  onPress,
}: UploadPickedButtonProps) {
  const label = uploaded
    ? 'Uploaded'
    : pickedCount > 0
      ? `Upload Picked (${pickedCount})`
      : 'Upload Picked';

  const a11yLabel = uploaded
    ? 'Uploaded'
    : pickedCount > 0
      ? `Upload ${pickedCount} picked photos`
      : 'Upload picked photos';
  const showNote = includesHidden && !uploaded;

  return (
    <>
      <Pressable
        onPress={onPress}
        disabled={uploaded || disabled}
        style={[
          styles.button,
          uploaded && styles.buttonUploaded,
          disabled && styles.buttonDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint={showNote ? NOTE_HINT : undefined}
        accessibilityState={{disabled: uploaded || disabled}}>
        {uploaded ? (
          <IconCheckCircle width={24} height={24} color={colors.accent} />
        ) : (
          <IconUpload width={24} height={24} color={colors.white} />
        )}
        <Text style={[styles.text, uploaded && styles.textUploaded]}>
          {label}
        </Text>
      </Pressable>
      {showNote && (
        <View style={styles.note}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants">
            <IconInfo width={16} height={16} color={colors.textMuted} />
          </View>
          <Text style={styles.noteText}>
            Upload includes picked photos outside this view.
          </Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonUploaded: {
    backgroundColor: colors.accent + '14',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  text: {
    ...sansBoldStyle,
    fontSize: 16,
    color: colors.white,
  },
  textUploaded: {
    color: colors.accent,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  noteText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.textMuted,
  },
});
