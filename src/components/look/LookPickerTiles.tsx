import { LookPickerTile } from '@components/look/LookPickerTile';
import { UploadPresetTile } from '@components/look/UploadPresetTile';
import { getLookLabel, LOOK_CATALOG } from '@lib/look/lookCatalog';
import type { CustomLook, LookId } from '@lib/look/types';
import { useState } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

export const TILE_WIDTH = 114;

type LookPickerTilesProps = {
  previewUri: string;
  currentLookId: LookId;
  selectedLookId: LookId;
  customLook: CustomLook | null | undefined;
  groupLabel: string;
  onKeyDown: ViewProps['onKeyDown'];
  keyDownEvents: ViewProps['keyDownEvents'];
  onSelectLook: (lookId: LookId) => void;
  onUploadPreset?: () => void;
  onTileRef: (lookId: LookId, node: View | null) => void;
};

export function LookPickerTiles({
  previewUri,
  currentLookId,
  selectedLookId,
  customLook,
  groupLabel,
  onKeyDown,
  keyDownEvents,
  onSelectLook,
  onUploadPreset,
  onTileRef,
}: LookPickerTilesProps) {
  const [rowHeight, setRowHeight] = useState<number | undefined>(undefined);
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
    <View style={styles.root}>
      <View
        style={styles.group}
        accessibilityRole="radiogroup"
        accessibilityLabel={groupLabel}
        onKeyDown={onKeyDown}
        keyDownEvents={keyDownEvents}
      >
        <View
          style={styles.row}
          testID="look-picker-row-1"
          onLayout={e => setRowHeight(e.nativeEvent.layout.height)}
        >
          {LOOK_CATALOG.map(look => renderTile(look.id, look.label))}
          <View style={styles.slot} />
        </View>
        {customLook ? (
          <View style={styles.customSlot}>
            {renderTile('custom', getLookLabel('custom', customLook.name))}
          </View>
        ) : null}
      </View>
      {/* Sibling of the radiogroup (a button, not a radio), overlaid on the row-1 slot. */}
      <View
        style={[styles.upload, { height: rowHeight }]}
        testID="upload-preset-slot"
      >
        <UploadPresetTile onPress={onUploadPreset} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignSelf: 'stretch',
  },
  group: {
    alignSelf: 'stretch',
    gap: 8,
  },
  slot: {
    flex: 1,
  },
  upload: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: TILE_WIDTH,
    flexDirection: 'row',
  },
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
