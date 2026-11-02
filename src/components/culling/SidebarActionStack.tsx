import { Pressable } from '@components/ui';
import { colors } from '@lib/ui/colors';
import { sansBoldStyle } from '@lib/ui/typography';
import type { Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import IconExport from '../../assets/images/icon_export.svg';
import IconPlus from '../../assets/images/icon_plus.svg';
import IconWand from '../../assets/images/icon_wand.svg';
import { UploadPickedButton } from './UploadPickedButton';

type SidebarActionStackProps = {
  actionCount: number;
  uploaded?: boolean;
  uploadDisabled?: boolean;
  uploadIncludesHidden?: boolean;
  addPhotosDisabled?: boolean;
  exportDisabled?: boolean;
  editPhotosDisabled?: boolean;
  onUploadSelected: () => void;
  onAddPhotos?: () => void;
  onExport: () => void;
  onEditPhotos: () => void;
  editPhotosRef?: Ref<View>;
};

export function SidebarActionStack({
  actionCount,
  uploaded = false,
  uploadDisabled = false,
  uploadIncludesHidden = false,
  addPhotosDisabled = false,
  exportDisabled = false,
  editPhotosDisabled = false,
  onUploadSelected,
  onAddPhotos,
  onExport,
  onEditPhotos,
  editPhotosRef,
}: SidebarActionStackProps) {
  return (
    <View style={styles.actionStack}>
      <UploadPickedButton
        pickedCount={actionCount}
        uploaded={uploaded}
        disabled={uploadDisabled}
        includesHidden={uploadIncludesHidden}
        onPress={onUploadSelected}
      />

      {onAddPhotos && (
        <Pressable
          onPress={onAddPhotos}
          disabled={addPhotosDisabled}
          style={[styles.button, addPhotosDisabled && styles.buttonDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Add photos to cull">
          <IconPlus width={20} height={20} color={colors.accent} />
          <Text style={styles.buttonText}>Add Photos to Cull</Text>
        </Pressable>
      )}

      <Pressable
        onPress={onExport}
        disabled={exportDisabled}
        style={[styles.button, exportDisabled && styles.buttonDisabled]}
        accessibilityRole="button"
        accessibilityLabel="Export picked photos">
        <IconExport width={24} height={24} color={colors.accent} />
        <Text style={styles.buttonText}>Export</Text>
      </Pressable>

      <Pressable
        {...{ ref: editPhotosRef }}
        onPress={onEditPhotos}
        disabled={editPhotosDisabled}
        style={[styles.button, editPhotosDisabled && styles.buttonDisabled]}
        accessibilityRole="button"
        accessibilityState={{ disabled: editPhotosDisabled }}
        accessibilityHint={editPhotosDisabled ? 'Add photos to edit' : undefined}
        accessibilityLabel="Edit photos">
        <IconWand width={22} height={22} color={colors.accent} />
        <Text style={styles.buttonText}>Edit Photos</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  actionStack: {
    gap: 16,
    flexShrink: 0,
  },
  button: {
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'transparent',
  },
  buttonText: {
    ...sansBoldStyle,
    fontSize: 16,
    color: colors.accent,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
});
