import {MasonryPhotoColumn} from '@components/photo/MasonryPhotoColumn';
import {MasonryPhotoTileItem} from '@components/photo/MasonryPhotoTile';
import {usePhotoDimensions} from '@hooks/usePhotoDimensions';
import {useThrottledValue} from '@hooks/useThrottledValue';
import {
  DEFAULT_ASPECT_HEIGHT,
  DEFAULT_ASPECT_WIDTH,
  distributeToColumns,
  getColumnCount,
  getColumnWidth,
  getMasonryColumnContentHeight,
  MASONRY_GAP,
} from '@lib/masonryLayout';
import {FileAsset} from '@services/upload/types';
import {useCallback, useMemo, useState} from 'react';
import {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

type MasonryPhotoItem = MasonryPhotoTileItem;

export type PhotoMasonryGridProps = {
  items: FileAsset[];
  gap?: number;
  horizontalPadding?: number;
  placeholderCount?: number;
};

const CONTENT_PADDING_TOP = 16;
const CONTENT_PADDING_BOTTOM = 32;
const SCROLL_WINDOW_THROTTLE_MS = 32;

function buildLayoutItems(
  items: FileAsset[],
  dimensions: Map<string, {width: number; height: number}>,
  placeholderCount: number,
): MasonryPhotoItem[] {
  const photoItems = items.map(item => {
    const size = dimensions.get(item.uri);
    return {
      id: item.uri,
      uri: item.uri,
      width: size?.width ?? DEFAULT_ASPECT_WIDTH,
      height: size?.height ?? DEFAULT_ASPECT_HEIGHT,
    };
  });

  if (placeholderCount <= 0) {
    return photoItems;
  }

  const placeholders = Array.from({length: placeholderCount}, (_, index) => ({
    id: `placeholder-${index}`,
    uri: '',
    width: DEFAULT_ASPECT_WIDTH,
    height: DEFAULT_ASPECT_HEIGHT,
    isPlaceholder: true,
  }));

  return [...photoItems, ...placeholders];
}

export function PhotoMasonryGrid({
  items,
  gap = MASONRY_GAP,
  horizontalPadding = 48,
  placeholderCount = 0,
}: PhotoMasonryGridProps) {
  const {dimensions} = usePhotoDimensions(items);
  const [containerWidth, setContainerWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const throttledScrollOffset = useThrottledValue(
    scrollOffset,
    SCROLL_WINDOW_THROTTLE_MS,
  );

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

  const maxColumnHeight = useMemo(() => {
    if (columnWidth <= 0 || columns.length === 0) {
      return 0;
    }

    return Math.max(
      ...columns.map(column =>
        getMasonryColumnContentHeight(
          column,
          columnWidth,
          gap,
          CONTENT_PADDING_TOP,
          CONTENT_PADDING_BOTTOM,
        ),
      ),
    );
  }, [columnWidth, columns, gap]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setScrollOffset(event.nativeEvent.contentOffset.y);
    },
    [],
  );

  function onContainerLayout(event: LayoutChangeEvent) {
    const {width, height} = event.nativeEvent.layout;
    if (width > 0 && width !== containerWidth) {
      setContainerWidth(width);
    }
    if (height > 0 && height !== viewportHeight) {
      setViewportHeight(height);
    }
  }

  if (layoutItems.length === 0) {
    return null;
  }

  return (
    <View
      style={[styles.container, {paddingHorizontal: horizontalPadding}]}
      onLayout={onContainerLayout}>
      {columnWidth > 0 && maxColumnHeight > 0 ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{height: maxColumnHeight}}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator
          bounces={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
          onScroll={handleScroll}>
          <View style={[styles.row, {gap, height: maxColumnHeight}]}>
            {columns.map((column, columnIndex) => (
              <MasonryPhotoColumn
                key={columnIndex}
                items={column}
                columnWidth={columnWidth}
                gap={gap}
                columnHeight={maxColumnHeight}
                contentPaddingTop={CONTENT_PADDING_TOP}
                contentPaddingBottom={CONTENT_PADDING_BOTTOM}
                scrollOffset={throttledScrollOffset}
                viewportHeight={viewportHeight}
              />
            ))}
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
});
