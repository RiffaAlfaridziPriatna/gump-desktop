import {colors} from '@lib/ui/colors';
import {
  createContext,
  ReactElement,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import {
  FlatList,
  LayoutChangeEvent,
  ListRenderItemInfo,
  RefreshControl,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';

type AlbumGridContextValue = {
  itemWidth: number;
};

const AlbumGridContext = createContext<AlbumGridContextValue>({itemWidth: 0});

export function useAlbumGridItemWidth() {
  return useContext(AlbumGridContext).itemWidth;
}

export type AlbumGridRenderItemInfo<T> = {
  item: T;
  index: number;
};

type AlbumGridProps<T> = {
  data: readonly T[];
  keyExtractor: (item: T, index: number) => string;
  renderItem: (info: AlbumGridRenderItemInfo<T>) => ReactElement | null;
  columns?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Applied outside the measured grid width so card sizing stays accurate. */
  contentPaddingHorizontal?: number;
  scrollEnabled?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
  extraData?: unknown;
  ListEmptyComponent?: ReactElement | null;
  ListHeaderComponent?: ReactElement | null;
  ListFooterComponent?: ReactElement | null;
};

export function AlbumGrid<T>({
  data,
  keyExtractor,
  renderItem,
  columns = 4,
  gap = 16,
  style,
  contentContainerStyle,
  contentPaddingHorizontal = 0,
  scrollEnabled = true,
  refreshing = false,
  onRefresh,
  onEndReached,
  onEndReachedThreshold = 0.4,
  extraData,
  ListEmptyComponent,
  ListHeaderComponent,
  ListFooterComponent,
}: AlbumGridProps<T>) {
  const [gridWidth, setGridWidth] = useState(0);

  const itemWidth = useMemo(() => {
    if (gridWidth <= 0) {
      return 0;
    }
    return (gridWidth - (columns - 1) * gap) / columns;
  }, [gridWidth, columns, gap]);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    setGridWidth(prev => (prev === width ? prev : width));
  }, []);

  const renderFlatItem = useCallback(
    ({item, index}: ListRenderItemInfo<T>) => renderItem({item, index}),
    [renderItem],
  );

  const columnWrapperStyle = useMemo(
    () =>
      columns > 1
        ? [styles.columnWrapper, {gap, marginBottom: gap}]
        : undefined,
    [columns, gap],
  );

  const singleColumnItemStyle = useMemo(
    () => (columns === 1 ? ({marginBottom: gap} as const) : undefined),
    [columns, gap],
  );

  const wrappedRenderItem = useCallback(
    (info: ListRenderItemInfo<T>) => {
      const child = renderFlatItem(info);
      if (columns === 1) {
        return <View style={singleColumnItemStyle}>{child}</View>;
      }
      return child;
    },
    [columns, renderFlatItem, singleColumnItemStyle],
  );

  const listContentStyle = useMemo(
    () => [styles.listContent, contentContainerStyle],
    [contentContainerStyle],
  );

  const refreshControl = onRefresh ? (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      colors={[colors.accent]}
      tintColor={colors.accent}
    />
  ) : undefined;

  return (
    <View
      style={[
        styles.container,
        style,
        contentPaddingHorizontal > 0 && {
          paddingHorizontal: contentPaddingHorizontal,
        },
      ]}>
      {/*
        Measure the inner width (after horizontal padding). Padding on the same
        node as onLayout would inflate card widths and overflow the row.
      */}
      <View style={styles.measure} onLayout={onLayout}>
        <AlbumGridContext.Provider value={{itemWidth}}>
          {itemWidth > 0 ? (
            <FlatList
              key={`album-grid-${columns}`}
              data={data as T[]}
              keyExtractor={keyExtractor}
              renderItem={wrappedRenderItem}
              numColumns={columns}
              columnWrapperStyle={columnWrapperStyle}
              style={styles.list}
              contentContainerStyle={listContentStyle}
              scrollEnabled={scrollEnabled}
              refreshControl={refreshControl}
              onEndReached={onEndReached}
              onEndReachedThreshold={onEndReachedThreshold}
              extraData={extraData}
              ListEmptyComponent={ListEmptyComponent}
              ListHeaderComponent={ListHeaderComponent}
              ListFooterComponent={ListFooterComponent}
              windowSize={7}
              maxToRenderPerBatch={columns * 2}
              initialNumToRender={columns * 3}
              updateCellsBatchingPeriod={50}
              removeClippedSubviews={false}
              showsVerticalScrollIndicator
            />
          ) : null}
        </AlbumGridContext.Provider>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // Allow the list to shrink inside column flex layouts so it scrolls
    // instead of expanding and clipping (overflow) at the screen edge.
    minHeight: 0,
    minWidth: 0,
    overflow: 'hidden',
  },
  measure: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
  },
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
  },
  columnWrapper: {
    flexDirection: 'row',
  },
});
