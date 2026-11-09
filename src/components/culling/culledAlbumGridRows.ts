import type {SimilarShotsViewSection} from '@lib/culling/similarShotsView';

export const GRID_COLUMNS = 3;
/** Fixed height of a section header row (includes its bottom gap). */
export const HEADER_ROW_HEIGHT = 40;
/** Space above every section header except the first. */
export const GROUP_GAP = 24;

export const THUMBNAIL_ASPECT_RATIO = 23 / 16;
export const CARD_PADDING_TOP = 8;
export const CARD_PADDING_HORIZONTAL = 8;
export const CARD_PADDING_BOTTOM = 12;
export const CARD_INTERNAL_GAP = 8;
export const CARD_FOOTER_HEIGHT = 28;

export function thumbnailWidthForCard(cardWidth: number): number {
  return cardWidth - CARD_PADDING_HORIZONTAL * 2;
}

/** Stride of one photo row: cards abut, so no gap between rows. */
export function photoRowHeight(cardWidth: number): number {
  return (
    CARD_PADDING_TOP +
    thumbnailWidthForCard(cardWidth) / THUMBNAIL_ASPECT_RATIO +
    CARD_INTERNAL_GAP +
    CARD_FOOTER_HEIGHT +
    CARD_PADDING_BOTTOM
  );
}

export function headerRowHeight(rowIndex: number): number {
  return rowIndex === 0 ? HEADER_ROW_HEIGHT : HEADER_ROW_HEIGHT + GROUP_GAP;
}

export type CulledAlbumGridSection = SimilarShotsViewSection;

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
  /** Header text lives on the section, so text edits never change rows. */
  sectionKey: string;
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

/** Drops ids that have no photo in `photosKey` (the photos' ids joined by \0). */
export function keepKnownPhotos(
  sections: CulledAlbumGridSection[],
  photosKey: string,
): CulledAlbumGridSection[] {
  const known = new Set(photosKey.split('\0'));
  return sections.map(section => ({
    ...section,
    photoIds: section.photoIds.filter(id => known.has(id)),
  }));
}

/** Identity of the row structure: equal when only header text changes. */
export function sectionsLayoutKey(sections?: CulledAlbumGridSection[]): string {
  return sections
    ? sections.map(s => `${s.key}:${s.photoIds.length}`).join('|')
    : '';
}

/**
 * Without sections: one flat run of photo rows. With sections: a header row
 * then that section's own photo rows; sections never share a row. Cell
 * indexes are global, so `photoIds` must be the sections' ids concatenated.
 * Only section keys and photoIds are read, never header text.
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
      sectionKey: section.key,
    });
    pushPhotoRows(rows, section.photoIds, firstIndex);
    firstIndex += section.photoIds.length;
  }
  return rows;
}

/** FlatList getItemLayout for mixed header/photo rows; flat lists stay O(1). */
export function createGetItemLayout(rows: GridRow[], photoHeight: number) {
  if (!rows.some(row => row.kind === 'header')) {
    return (_data: ArrayLike<GridRow> | null | undefined, index: number) => ({
      length: photoHeight,
      offset: photoHeight * index,
      index,
    });
  }
  const lengths = rows.map(row =>
    row.kind === 'header' ? headerRowHeight(row.rowIndex) : photoHeight,
  );
  const offsets: number[] = [];
  let offset = 0;
  for (const length of lengths) {
    offsets.push(offset);
    offset += length;
  }
  return (_data: ArrayLike<GridRow> | null | undefined, index: number) => ({
    length: lengths[index] ?? photoHeight,
    offset: offsets[index] ?? offset,
    index,
  });
}
