import {colors} from '@lib/ui/colors';
import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  FlatList,
  ListRenderItemInfo,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
} from 'react-native';

const COLUMNS = 3;
const MIN_ROWS = 5;
const ASPECT_RATIO = 3 / 2;
const GAP = 8;
const RESIZE_SETTLE_MS = 150;

type SkeletonRow = {
  key: string;
  rowIndex: number;
};

type PhotoGridSkeletonProps = {
  horizontalPadding?: number;
  columns?: number;
  rows?: number;
};

type SkeletonRowViewProps = {
  row: SkeletonRow;
  columns: number;
  itemWidth: number;
  itemHeight: number;
  gap: number;
};

const SkeletonRowView = memo(function SkeletonRowView({
  row,
  columns,
  itemWidth,
  itemHeight,
  gap,
}: SkeletonRowViewProps) {
  return (
    <View style={[styles.row, {marginBottom: gap, gap}]}>
      {Array.from({length: columns}, (_, columnIndex) => (
        <View
          key={`${row.rowIndex}-${columnIndex}`}
          style={[styles.cell, {width: itemWidth, height: itemHeight}]}
        />
      ))}
    </View>
  );
});

function buildSkeletonRows(rowCount: number): SkeletonRow[] {
  return Array.from({length: rowCount}, (_, rowIndex) => ({
    key: `skeleton-row-${rowIndex}`,
    rowIndex,
  }));
}

export function PhotoGridSkeleton({
  horizontalPadding = 48,
  columns = COLUMNS,
  rows = MIN_ROWS,
}: PhotoGridSkeletonProps) {
  const {width: windowWidth} = useWindowDimensions();
  const [settledLayoutWidth, setSettledLayoutWidth] = useState(0);
  const settledLayoutWidthRef = useRef(0);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const skeletonRows = useMemo(() => buildSkeletonRows(rows), [rows]);

  const handleContainerLayout = useCallback((event: LayoutChangeEvent) => {
    const width = event.nativeEvent.layout.width;
    if (width === settledLayoutWidthRef.current) {
      return;
    }

    if (resizeTimerRef.current) {
      clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = null;
    }

    if (settledLayoutWidthRef.current === 0) {
      settledLayoutWidthRef.current = width;
      setSettledLayoutWidth(width);
      return;
    }

    resizeTimerRef.current = setTimeout(() => {
      settledLayoutWidthRef.current = width;
      setSettledLayoutWidth(width);
      resizeTimerRef.current = null;
    }, RESIZE_SETTLE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
      }
    };
  }, []);

  const effectiveWidth =
    settledLayoutWidth > 0 ? settledLayoutWidth : windowWidth;
  const containerWidth = effectiveWidth - horizontalPadding * 2;
  const itemWidth =
    containerWidth > 0
      ? (containerWidth - GAP * (columns - 1)) / columns
      : 0;
  const itemHeight = itemWidth / ASPECT_RATIO;
  const rowHeight = itemHeight + GAP;

  const renderRow = useCallback(
    ({item: row}: ListRenderItemInfo<SkeletonRow>) => (
      <SkeletonRowView
        row={row}
        columns={columns}
        itemWidth={itemWidth}
        itemHeight={itemHeight}
        gap={GAP}
      />
    ),
    [columns, itemHeight, itemWidth],
  );

  const keyExtractor = useCallback((row: SkeletonRow) => row.key, []);

  const getItemLayout = useCallback(
    (_data: ArrayLike<SkeletonRow> | null | undefined, index: number) => ({
      length: rowHeight,
      offset: rowHeight * index,
      index,
    }),
    [rowHeight],
  );

  if (itemWidth <= 0) {
    return null;
  }

  return (
    <View style={styles.container} onLayout={handleContainerLayout}>
      <FlatList
        data={skeletonRows}
        renderItem={renderRow}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        windowSize={5}
        removeClippedSubviews={Platform.OS !== 'macos'}
        initialNumToRender={rows}
        maxToRenderPerBatch={4}
        updateCellsBatchingPeriod={100}
        showsVerticalScrollIndicator
        contentContainerStyle={[
          styles.listContent,
          {paddingHorizontal: horizontalPadding},
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 16,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    backgroundColor: colors.cardBackgroundSecondary,
  },
});
