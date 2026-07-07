import {
  MasonryPhotoTile,
  MasonryPhotoTileItem,
} from '@components/photo/MasonryPhotoTile';
import {buildMasonryColumnLayouts} from '@lib/masonryLayout';
import {useEffect, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';

const VIEWPORT_OVERSCAN = 320;
const INITIAL_MOUNT_COUNT = 8;

type MasonryPhotoColumnProps = {
  items: MasonryPhotoTileItem[];
  columnWidth: number;
  gap: number;
  columnHeight: number;
  contentPaddingTop: number;
  contentPaddingBottom: number;
  scrollOffset: number;
  viewportHeight: number;
};

function getVisibleItemIds(
  layoutEntries: ReturnType<typeof buildMasonryColumnLayouts>,
  items: MasonryPhotoTileItem[],
  contentPaddingTop: number,
  scrollOffset: number,
  viewportHeight: number,
): string[] {
  if (viewportHeight <= 0) {
    return items.slice(0, INITIAL_MOUNT_COUNT).map(item => item.id);
  }

  const visibleTop = scrollOffset - VIEWPORT_OVERSCAN;
  const visibleBottom = scrollOffset + viewportHeight + VIEWPORT_OVERSCAN;

  return layoutEntries.flatMap((layout, index) => {
    const itemTop = contentPaddingTop + layout.offset;
    const itemBottom = itemTop + layout.itemHeight;

    if (itemBottom < visibleTop || itemTop > visibleBottom) {
      return [];
    }

    return [items[index].id];
  });
}

export function MasonryPhotoColumn({
  items,
  columnWidth,
  gap,
  columnHeight,
  contentPaddingTop,
  contentPaddingBottom,
  scrollOffset,
  viewportHeight,
}: MasonryPhotoColumnProps) {
  const itemsKey = useMemo(
    () => items.map(item => item.id).join('\n'),
    [items],
  );
  const [mountedIds, setMountedIds] = useState<Set<string>>(() => new Set());

  const layoutEntries = useMemo(
    () => buildMasonryColumnLayouts(items, columnWidth, gap),
    [columnWidth, gap, items],
  );

  useEffect(() => {
    setMountedIds(new Set());
  }, [itemsKey]);

  useEffect(() => {
    const visibleIds = getVisibleItemIds(
      layoutEntries,
      items,
      contentPaddingTop,
      scrollOffset,
      viewportHeight,
    );

    if (visibleIds.length === 0) {
      return;
    }

    setMountedIds(current => {
      let changed = false;
      const next = new Set(current);

      for (const id of visibleIds) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [
    contentPaddingTop,
    items,
    layoutEntries,
    scrollOffset,
    viewportHeight,
  ]);

  const mountedItems = useMemo(
    () =>
      layoutEntries.flatMap((layout, index) => {
        const item = items[index];
        if (!mountedIds.has(item.id)) {
          return [];
        }

        return [{item, layout}];
      }),
    [items, layoutEntries, mountedIds],
  );

  return (
    <View style={[styles.column, {width: columnWidth, height: columnHeight}]}>
      {mountedItems.map(({item, layout}) => (
        <View
          key={item.id}
          style={[
            styles.item,
            {
              top: contentPaddingTop + layout.offset,
              width: columnWidth,
              height: layout.itemHeight,
            },
          ]}>
          <MasonryPhotoTile
            item={item}
            width={columnWidth}
            height={layout.itemHeight}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    position: 'relative',
  },
  item: {
    position: 'absolute',
    left: 0,
  },
});
