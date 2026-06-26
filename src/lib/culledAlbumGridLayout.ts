import {CULLED_ALBUM_THUMBNAIL_ASPECT_RATIO} from '@lib/imageDimensions';

const GRID_GAP = 16;
/** Gap between thumbnail and info row inside each card. */
const CARD_INTERNAL_GAP = 8;
/** Tallest control in the info row (selection button). */
const CARD_INFO_ROW_HEIGHT = 28;

export function getCulledAlbumGridLayout(
  mainContentWidth: number,
  isMobileLayout: boolean,
) {
  const minWidth = isMobileLayout ? 160 : 320;
  const columnCount = Math.max(1, Math.floor(mainContentWidth / minWidth));
  const paddingRight = isMobileLayout ? 0 : 24;
  const cardWidth =
    (mainContentWidth - GRID_GAP * (columnCount - 1)) / columnCount -
    paddingRight;
  const thumbnailHeight = cardWidth / CULLED_ALBUM_THUMBNAIL_ASPECT_RATIO;
  const itemHeight =
    thumbnailHeight + CARD_INTERNAL_GAP + CARD_INFO_ROW_HEIGHT;
  const rowHeight = itemHeight + GRID_GAP;

  return {
    columnCount,
    cardWidth,
    gap: GRID_GAP,
    itemHeight,
    rowHeight,
  };
}

type GridPhoto = {photoId: string};

export type CulledAlbumGridRow<T extends GridPhoto> = {
  id: string;
  photos: T[];
};

export function buildCulledAlbumGridRows<T extends GridPhoto>(
  photos: T[],
  columnCount: number,
): CulledAlbumGridRow<T>[] {
  const rows: CulledAlbumGridRow<T>[] = [];
  for (let index = 0; index < photos.length; index += columnCount) {
    const rowPhotos = photos.slice(index, index + columnCount);
    rows.push({
      id: rowPhotos.map(photo => photo.photoId).join('|'),
      photos: rowPhotos,
    });
  }
  return rows;
}
