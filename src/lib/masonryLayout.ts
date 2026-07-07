import {BREAKPOINTS} from './platform';

export const MASONRY_GAP = 12;
export const DEFAULT_ASPECT_HEIGHT_RATIO = 0.7;
export const DEFAULT_ASPECT_WIDTH = 10;
export const DEFAULT_ASPECT_HEIGHT = 7;

export type MasonryLayoutItem = {
  id: string;
  width: number;
  height: number;
};

export function getColumnCount(containerWidth: number): number {
  if (containerWidth < BREAKPOINTS.mobile) return 1;
  if (containerWidth < BREAKPOINTS.tablet) return 2;
  return 3;
}

export function getColumnWidth(
  containerWidth: number,
  columns: number,
  gap: number,
): number {
  return (containerWidth - gap * columns) / columns;
}

export function getItemHeight(
  columnWidth: number,
  width: number,
  height: number,
): number {
  if (width <= 0) {
    return columnWidth * DEFAULT_ASPECT_HEIGHT_RATIO;
  }
  return columnWidth * (height / width);
}

export type MasonryColumnLayoutEntry = {
  length: number;
  offset: number;
  index: number;
  itemHeight: number;
};

export function buildMasonryColumnLayouts(
  items: MasonryLayoutItem[],
  columnWidth: number,
  gap: number,
): MasonryColumnLayoutEntry[] {
  let offset = 0;

  return items.map((item, index) => {
    const itemHeight = getItemHeight(columnWidth, item.width, item.height);
    const entry = {
      length: itemHeight + gap,
      offset,
      index,
      itemHeight,
    };
    offset += entry.length;
    return entry;
  });
}

export function getMasonryColumnContentHeight(
  items: MasonryLayoutItem[],
  columnWidth: number,
  gap: number,
  paddingTop: number,
  paddingBottom: number,
): number {
  if (items.length === 0) {
    return paddingTop + paddingBottom;
  }

  const layouts = buildMasonryColumnLayouts(items, columnWidth, gap);
  const last = layouts[layouts.length - 1];
  return paddingTop + last.offset + last.itemHeight + paddingBottom;
}

export function distributeToColumns<T extends MasonryLayoutItem>(
  items: T[],
  columnCount: number,
  columnWidth: number,
  gap: number,
): T[][] {
  const columns: T[][] = Array.from({length: columnCount}, () => []);
  const columnHeights = Array.from({length: columnCount}, () => 0);

  for (const item of items) {
    let shortestColumn = 0;
    for (let i = 1; i < columnCount; i++) {
      if (columnHeights[i] < columnHeights[shortestColumn]) {
        shortestColumn = i;
      }
    }

    columns[shortestColumn].push(item);
    columnHeights[shortestColumn] +=
      getItemHeight(columnWidth, item.width, item.height) + gap;
  }

  return columns;
}
