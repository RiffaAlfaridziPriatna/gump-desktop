import {FileAsset} from '@services/upload/types';

export type AlbumGridFileItem = {
  photoId: string;
  file: FileAsset;
};

function gridFileEqual(
  cached: AlbumGridFileItem,
  next: AlbumGridFileItem,
): boolean {
  return (
    cached.photoId === next.photoId &&
    cached.file.uri === next.file.uri &&
    cached.file.thumbnailUri === next.file.thumbnailUri &&
    cached.file.name === next.file.name
  );
}

export function stabilizeAlbumGridFiles(
  cache: Map<string, AlbumGridFileItem>,
  nextItems: AlbumGridFileItem[],
  previousItems?: AlbumGridFileItem[],
): AlbumGridFileItem[] {
  const stableItems: AlbumGridFileItem[] = [];
  const nextPhotoIds = new Set<string>();

  for (const nextItem of nextItems) {
    nextPhotoIds.add(nextItem.photoId);
    const cachedItem = cache.get(nextItem.photoId);

    if (cachedItem && gridFileEqual(cachedItem, nextItem)) {
      stableItems.push(cachedItem);
      continue;
    }

    cache.set(nextItem.photoId, nextItem);
    stableItems.push(nextItem);
  }

  for (const photoId of cache.keys()) {
    if (!nextPhotoIds.has(photoId)) {
      cache.delete(photoId);
    }
  }

  if (
    previousItems &&
    stableItems.length === previousItems.length &&
    stableItems.every((item, index) => item === previousItems[index])
  ) {
    return previousItems;
  }

  return stableItems;
}
