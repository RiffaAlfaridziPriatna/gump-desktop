import {usePhotoDimensions} from '@hooks/usePhotoDimensions';
import {colors} from '@lib/colors';
import {
  DEFAULT_ASPECT_HEIGHT,
  DEFAULT_ASPECT_WIDTH,
  distributeToColumns,
  getColumnCount,
  getColumnWidth,
  getItemHeight,
  MASONRY_GAP,
  MasonryLayoutItem,
} from '@lib/masonryLayout';
import {FileAsset} from '@services/upload/types';
import {useMemo, useState} from 'react';
import {
  Image,
  LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

type MasonryPhotoItem = MasonryLayoutItem & {
  uri: string;
  isPlaceholder?: boolean;
};

export type PhotoMasonryGridProps = {
  items: FileAsset[];
  gap?: number;
  horizontalPadding?: number;
  placeholderCount?: number;
};

function buildLayoutItems(
  items: FileAsset[],
  dimensions: Map<string, {width: number; height: number}>,
  placeholderCount: number,
): MasonryPhotoItem[] {
  if (items.length > 0) {
    return items.map(item => {
      const size = dimensions.get(item.uri);
      return {
        id: item.uri,
        uri: item.uri,
        width: size?.width ?? DEFAULT_ASPECT_WIDTH,
        height: size?.height ?? DEFAULT_ASPECT_HEIGHT,
      };
    });
  }

  return Array.from({length: placeholderCount}, (_, index) => ({
    id: `placeholder-${index}`,
    uri: '',
    width: DEFAULT_ASPECT_WIDTH,
    height: DEFAULT_ASPECT_HEIGHT,
    isPlaceholder: true,
  }));
}

export function PhotoMasonryGrid({
  items,
  gap = MASONRY_GAP,
  horizontalPadding = 48,
  placeholderCount = 0,
}: PhotoMasonryGridProps) {
  const {dimensions} = usePhotoDimensions(items);
  const [containerWidth, setContainerWidth] = useState(0);

  const layoutItems = useMemo(
    () => buildLayoutItems(items, dimensions, placeholderCount),
    [dimensions, items, placeholderCount],
  );

  const columnCount =
    containerWidth > 0 ? getColumnCount(containerWidth) : 3;
  const columnWidth =
    containerWidth > 0
      ? getColumnWidth(containerWidth, columnCount, gap)
      : 0;

  const columns = useMemo(() => {
    if (columnWidth <= 0 || layoutItems.length === 0) {
      return [];
    }
    return distributeToColumns(layoutItems, columnCount, columnWidth, gap);
  }, [columnCount, columnWidth, gap, layoutItems]);

  function onLayout(event: LayoutChangeEvent) {
    const width = event.nativeEvent.layout.width;
    if (width > 0 && width !== containerWidth) {
      setContainerWidth(width);
    }
  }

  if (layoutItems.length === 0) {
    return null;
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[
        styles.content,
        {paddingHorizontal: horizontalPadding},
      ]}>
      <View style={[styles.row, {gap}]} onLayout={onLayout}>
        {columnWidth > 0
          ? columns.map((column, columnIndex) => (
              <View key={columnIndex} style={[styles.column, {gap}]}>
                {column.map(item => {
                  const height = getItemHeight(
                    columnWidth,
                    item.width,
                    item.height,
                  );
                  if (item.isPlaceholder) {
                    return (
                      <View
                        key={item.id}
                        style={[
                          styles.placeholder,
                          {width: columnWidth, height},
                        ]}
                      />
                    );
                  }
                  return (
                    <Image
                      key={item.id}
                      source={{uri: item.uri}}
                      style={{width: columnWidth, height}}
                      resizeMode="cover"
                    />
                  );
                })}
              </View>
            ))
          : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingTop: 16,
    paddingBottom: 32,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  column: {
    flex: 1,
  },
  placeholder: {
    backgroundColor: colors.border,
  },
});
