import { LookPickerTile } from '@components/look/LookPickerTile';
import { UploadPresetTile } from '@components/look/UploadPresetTile';
import { getLookLabel, LOOK_CATALOG } from '@lib/look/lookCatalog';
import type { CustomLook, LookId } from '@lib/look/types';
import { StyleSheet, View } from 'react-native';

export const TILE_WIDTH = 114;

type LookPickerTilesProps = {
  previewUri: string;
  currentLookId: LookId;
  selectedLookId: LookId;
  customLook: CustomLook | null | undefined;
  onSelectLook: (lookId: LookId) => void;
  onUploadPreset?: () => void;
  onTileRef: (lookId: LookId, node: View | null) => void;
};

export function LookPickerTiles({
  previewUri,
  currentLookId,
  selectedLookId,
  customLook,
  onSelectLook,
  onUploadPreset,
  onTileRef,
}: LookPickerTilesProps) {
  const renderTile = (lookId: LookId, label: string) => (
    <LookPickerTile
      key={lookId}
      lookId={lookId}
      label={label}
      previewUri={previewUri}
      selected={lookId === selectedLookId}
      current={lookId === currentLookId}
      onSelect={onSelectLook}
      focusRef={node => onTileRef(lookId, node)}
    />
  );

  return (
    <>
      <View style={styles.row}>
        {LOOK_CATALOG.map(look => renderTile(look.id, look.label))}
        <UploadPresetTile onPress={onUploadPreset} />
      </View>
      {customLook ? (
        <View style={styles.customSlot}>
          {renderTile('custom', getLookLabel('custom', customLook.name))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    gap: 8,
  },
  // Figma: custom tile sits in row 2 under the Upload preset tile.
  customSlot: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    width: TILE_WIDTH,
  },
});
