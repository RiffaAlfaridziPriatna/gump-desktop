export const GRID_COLUMNS = 3;
/** Fixed height of a section header row (includes its bottom gap). */
export const HEADER_ROW_HEIGHT = 40;

export type CulledAlbumGridSection = {
  key: string;
  title: string;
  subtitle?: string;
  /** Renders the stack icon (group header); omit for the plain header. */
  isGroup?: boolean;
  photoIds: string[];
};

export type GridListItem = {
  photoId: string;
  index: number;
};

export type PhotoGridRow = {
  kind: 'photos';
  key: string;
  rowIndex: number;
  cells: GridListItem[];
};

export type HeaderGridRow = {
  kind: 'header';
  key: string;
  rowIndex: number;
  title: string;
  subtitle?: string;
  isGroup?: boolean;
};

export type GridRow = PhotoGridRow | HeaderGridRow;

function pushPhotoRows(
  rows: GridRow[],
  photoIds: string[],
  firstIndex: number,
): void {
  for (let index = 0; index < photoIds.length; index += GRID_COLUMNS) {
    const rowPhotoIds = photoIds.slice(index, index + GRID_COLUMNS);
    const rowIndex = rows.length;
    rows.push({
      kind: 'photos',
      key: `row-${rowIndex}:${rowPhotoIds.join(',')}`,
      rowIndex,
      cells: rowPhotoIds.map((photoId, columnIndex) => ({
        photoId,
        index: firstIndex + index + columnIndex,
      })),
    });
  }
}

/**
 * Without sections: one flat run of photo rows. With sections: a header row
 * then that section's own photo rows; sections never share a row. Cell
 * indexes are global, so `photoIds` must be the sections' ids concatenated.
 */
export function buildRows(
  photoIds: string[],
  sections?: CulledAlbumGridSection[],
): GridRow[] {
  const rows: GridRow[] = [];
  if (!sections) {
    pushPhotoRows(rows, photoIds, 0);
    return rows;
  }

  let firstIndex = 0;
  for (const section of sections) {
    if (section.photoIds.length === 0) {
      continue;
    }
    rows.push({
      kind: 'header',
      key: `header-${section.key}`,
      rowIndex: rows.length,
      title: section.title,
      subtitle: section.subtitle,
      isGroup: section.isGroup,
    });
    pushPhotoRows(rows, section.photoIds, firstIndex);
    firstIndex += section.photoIds.length;
  }
  return rows;
}

/** FlatList getItemLayout for mixed header/photo rows; flat lists stay O(1). */
export function createGetItemLayout(rows: GridRow[], photoRowHeight: number) {
  if (!rows.some(row => row.kind === 'header')) {
    return (_data: ArrayLike<GridRow> | null | undefined, index: number) => ({
      length: photoRowHeight,
      offset: photoRowHeight * index,
      index,
    });
  }
  const lengths = rows.map(row =>
    row.kind === 'header' ? HEADER_ROW_HEIGHT : photoRowHeight,
  );
  const offsets: number[] = [];
  let offset = 0;
  for (const length of lengths) {
    offsets.push(offset);
    offset += length;
  }
  return (_data: ArrayLike<GridRow> | null | undefined, index: number) => ({
    length: lengths[index] ?? photoRowHeight,
    offset: offsets[index] ?? offset,
    index,
  });
}
