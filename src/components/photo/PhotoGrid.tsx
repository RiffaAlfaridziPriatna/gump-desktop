import {useVisiblePhotos} from '@hooks/useVisiblePhotos';
import {getContainedImageLayout} from '@lib/culling/cullingFaceCrop';
import {
  getCachedImageDimensions,
  loadImageDimensions,
  type ImageDimensions,
} from '@lib/media/imageDimensions';
import {preloadFileAssets} from '@lib/media/imagePreload';
import {resolveDisplayUri} from '@lib/storage/localStorage';
import {colors} from '@lib/ui/colors';
import {FileAsset} from '@services/upload/types';
import {memo, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  FlatList,
  Image,
  type ImageLoadEventData,
  ListRenderItemInfo,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewToken,
  type NativeSyntheticEvent,
} from 'react-native';

const COLUMNS = 3;
const ASPECT_RATIO = 3 / 2;
const HORIZONTAL_PADDING = 48;
const GAP = 8;
const VISIBLE_PADDING = 9;

const PhotoGridCellImage = memo(function PhotoGridCellImage({
  uri,
  width,
  height,
}: {
  uri: string;
  width: number;
  height: number;
}) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [imageSize, setImageSize] = useState<ImageDimensions | null>(
    () => getCachedImageDimensions(uri) ?? null,
  );

  const imageLayout = useMemo(() => {
    if (!imageSize) {
      return null;
    }

    return getContainedImageLayout(
      width,
      height,
      imageSize.width,
      imageSize.height,
    );
  }, [height, imageSize, width]);

  useEffect(() => {
    const cached = getCachedImageDimensions(uri);
    if (cached) {
      setImageSize(cached);
      return;
    }

    let cancelled = false;

    loadImageDimensions(uri).then(dimensions => {
      if (!cancelled && dimensions) {
        setImageSize(dimensions);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [uri]);

  const handleLoad = useCallback(
    (event: NativeSyntheticEvent<ImageLoadEventData>) => {
      const cached = getCachedImageDimensions(uri);
      if (cached) {
        setImageSize(cached);
      } else {
        const {width: loadedWidth, height: loadedHeight} = event.nativeEvent.source;

        if (loadedWidth > 0 && loadedHeight > 0) {
          setImageSize({width: loadedWidth, height: loadedHeight});
        }
      }

      setIsLoaded(true);
    },
    [uri],
  );

  return (
    <View
      style={[
        styles.itemContainer,
        {width, height, backgroundColor: colors.cardBackgroundSecondary},
      ]}>
      <Image
        source={{uri}}
        onLoad={handleLoad}
        onError={() => setIsLoaded(true)}
        style={
          imageLayout
            ? [
                styles.containedImage,
                {
                  width: imageLayout.width,
                  height: imageLayout.height,
                  left: imageLayout.left,
                  top: imageLayout.top,
                  opacity: isLoaded ? 1 : 0,
                },
              ]
            : styles.imageHidden
        }
      />
    </View>
  );
});

export type PhotoGridProps = {
  items: FileAsset[];
  albumId?: string;
  horizontalPadding?: number;
  gap?: number;
  onPhotoPress?: (item: FileAsset, index: number) => void;
};

type PhotoGridCell = {
  key: string;
  uri: string;
  item: FileAsset;
  index: number;
};

type PhotoGridRow = {
  key: string;
  rowIndex: number;
  cells: PhotoGridCell[];
};

function buildRows(items: FileAsset[]): PhotoGridRow[] {
  const rows: PhotoGridRow[] = [];

  for (let index = 0; index < items.length; index += COLUMNS) {
    const rowItems = items.slice(index, index + COLUMNS);
    const rowIndex = index / COLUMNS;
    rows.push({
      key: `row-${rowIndex}`,
      rowIndex,
      cells: rowItems.map((item, columnIndex) => {
        const cellIndex = index + columnIndex;
        return {
          key: `${cellIndex}:${item.uri}`,
          uri: resolveDisplayUri(item),
          item,
          index: cellIndex,
        };
      }),
    });
  }

  return rows;
}

export function PhotoGrid({
  items,
  albumId,
  horizontalPadding = HORIZONTAL_PADDING,
  gap = GAP,
  onPhotoPress,
}: PhotoGridProps) {
  const {width: windowWidth} = useWindowDimensions();
  const [visibleIndices, setVisibleIndices] = useState<number[]>([]);

  const containerWidth = windowWidth - horizontalPadding * 2;
  const itemWidth = (containerWidth - gap * (COLUMNS - 1)) / COLUMNS;
  const itemHeight = itemWidth / ASPECT_RATIO;
  const rowHeight = itemHeight + gap;

  const rows = useMemo(() => buildRows(items), [items]);

  useVisiblePhotos(albumId ?? null, visibleIndices, VISIBLE_PADDING);

  const renderRow = useCallback(
    ({item: row}: ListRenderItemInfo<PhotoGridRow>) => (
      <View style={[styles.row, {marginBottom: gap, gap}]}>
        {row.cells.map(cell => (
          <PhotoGridCellImage
            key={cell.key}
            uri={cell.uri}
            width={itemWidth}
            height={itemHeight}
          />
        ))}
        {row.cells.length < COLUMNS &&
          Array.from({length: COLUMNS - row.cells.length}).map((_, fillerIndex) => (
            <View
              key={`filler-${row.rowIndex}-${fillerIndex}`}
              style={{width: itemWidth, height: itemHeight}}
            />
          ))}
      </View>
    ),
    [gap, itemHeight, itemWidth],
  );

  const keyExtractor = useCallback((row: PhotoGridRow) => row.key, []);

  const getItemLayout = useCallback(
    (_data: ArrayLike<PhotoGridRow> | null | undefined, index: number) => ({
      length: rowHeight,
      offset: rowHeight * index,
      index,
    }),
    [rowHeight],
  );

  const lastPreloadRangeRef = useRef<string>('');
  const handleViewableItemsChanged = useCallback(
    ({viewableItems}: {viewableItems: ViewToken<PhotoGridRow>[]}) => {
      const indices = viewableItems.flatMap(token =>
        (token.item as PhotoGridRow | undefined)?.cells.map(cell => cell.index) ?? [],
      );
      setVisibleIndices(indices);

      if (indices.length === 0) {
        return;
      }

      const minIndex = Math.min(...indices);
      const maxIndex = Math.max(...indices);
      const padding = VISIBLE_PADDING * COLUMNS;
      const start = Math.max(0, minIndex - padding);
      const end = Math.min(items.length, maxIndex + padding + 1);
      const key = `${start}:${end}`;
      if (lastPreloadRangeRef.current === key) {
        return;
      }
      lastPreloadRangeRef.current = key;

      const files = items.slice(start, end);
      preloadFileAssets(files).catch(() => undefined);
    },
    [items],
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={rows}
        renderItem={renderRow}
        keyExtractor={keyExtractor}
        getItemLayout={getItemLayout}
        windowSize={7}
        removeClippedSubviews={Platform.OS !== 'macos'}
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        showsVerticalScrollIndicator
        contentContainerStyle={[styles.listContent, {paddingHorizontal: horizontalPadding}]}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={{
          itemVisiblePercentThreshold: 20,
        }}
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
  itemContainer: {
    overflow: 'hidden',
  },
  containedImage: {
    position: 'absolute',
  },
  imageHidden: {
    position: 'absolute',
    width: 0,
    height: 0,
    opacity: 0,
  },
});
