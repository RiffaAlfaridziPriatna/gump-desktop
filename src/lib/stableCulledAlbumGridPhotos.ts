import {CulledAlbumGridPhoto} from '@components/culling/CulledAlbumPhotoGrid';
import {APIResponse} from '@services/api';

type GridPhotoInput = CulledAlbumGridPhoto;

function analysisEqual(
  left: APIResponse.CullingPhoto | undefined,
  right: APIResponse.CullingPhoto | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return left === right;
  }

  return (
    left.selected === right.selected &&
    left.starRating === right.starRating &&
    left.aiSelected === right.aiSelected &&
    left.maybe === right.maybe &&
    left.blurred === right.blurred &&
    left.closedEyes === right.closedEyes &&
    left.duplicated === right.duplicated &&
    left.faces.length === right.faces.length
  );
}

function gridPhotoEqual(
  cached: GridPhotoInput,
  next: GridPhotoInput,
): boolean {
  return (
    cached.photoId === next.photoId &&
    cached.disabled === next.disabled &&
    cached.file.uri === next.file.uri &&
    cached.file.name === next.file.name &&
    analysisEqual(cached.analysis, next.analysis)
  );
}

export function stabilizeGridPhotos(
  cache: Map<string, GridPhotoInput>,
  nextPhotos: GridPhotoInput[],
): GridPhotoInput[] {
  const stablePhotos: GridPhotoInput[] = [];
  const nextPhotoIds = new Set<string>();

  for (const nextPhoto of nextPhotos) {
    nextPhotoIds.add(nextPhoto.photoId);
    const cachedPhoto = cache.get(nextPhoto.photoId);

    if (cachedPhoto && gridPhotoEqual(cachedPhoto, nextPhoto)) {
      stablePhotos.push(cachedPhoto);
      continue;
    }

    cache.set(nextPhoto.photoId, nextPhoto);
    stablePhotos.push(nextPhoto);
  }

  for (const photoId of cache.keys()) {
    if (!nextPhotoIds.has(photoId)) {
      cache.delete(photoId);
    }
  }

  return stablePhotos;
}
