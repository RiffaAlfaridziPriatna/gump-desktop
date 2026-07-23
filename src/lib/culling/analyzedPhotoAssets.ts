import {syncPhotoFromStore} from '@/application/syncPhotoRepository';
import {getPhotoById, updatePhoto} from '@lib/culledAlbum/store';
import {CulledAlbumPhoto} from '@lib/culledAlbum/types';
import {ensureThumbnail} from '@lib/storage/localStorage';
import {attachFaceCropUris} from './faceCropThumbnails';
import {Platform} from 'react-native';

const BACKFILL_CONCURRENCY = Platform.OS === 'windows' ? 2 : 3;

export type AnalyzedPhotoAssetsBackfillOptions = {
  regenerateFaceCrops?: boolean;
};

type PendingAssetBackfill = {
  albumId: string;
  photoId: string;
  file: CulledAlbumPhoto['file'];
  options?: AnalyzedPhotoAssetsBackfillOptions;
};

function assetBackfillKey(albumId: string, photoId: string): string {
  return `${albumId}:${photoId}`;
}

const pendingAssetBackfills: PendingAssetBackfill[] = [];
const pendingAssetBackfillKeys = new Set<string>();
const activeAssetBackfillKeys = new Set<string>();
let activeAssetBackfills = 0;

async function backfillAnalyzedPhotoAssets(
  albumId: string,
  photo: CulledAlbumPhoto,
  options?: AnalyzedPhotoAssetsBackfillOptions,
): Promise<void> {
  const regenerateFaceCrops = options?.regenerateFaceCrops ?? false;
  const needsFaceCrops =
    photo.faces.length > 0 &&
    (regenerateFaceCrops || photo.faces.some(face => !face.cropUri));
  const needsThumbnail = !photo.file.thumbnailUri;

  if (!needsFaceCrops && !needsThumbnail) {
    return;
  }

  const [facesWithCrops, fileWithThumbnail] = await Promise.all([
    needsFaceCrops
      ? attachFaceCropUris(
          albumId,
          photo.photoId,
          photo.file,
          photo.faces,
          {regenerate: regenerateFaceCrops},
        )
      : Promise.resolve(photo.faces),
    needsThumbnail
      ? ensureThumbnail(albumId, photo.file, photo.photoId)
      : Promise.resolve(photo.file),
  ]);

  updatePhoto(
    albumId,
    photo.photoId,
    entry => {
      if (needsFaceCrops) {
        entry.faces = facesWithCrops;
      }
      if (fileWithThumbnail.thumbnailUri) {
        entry.file = {
          ...entry.file,
          thumbnailUri: fileWithThumbnail.thumbnailUri,
        };
      }
    },
    {recomputeTotals: false},
  );
  syncPhotoFromStore(albumId, photo.photoId);
}

function pumpAssetBackfillQueue(): void {
  while (
    activeAssetBackfills < BACKFILL_CONCURRENCY &&
    pendingAssetBackfills.length > 0
  ) {
    const next = pendingAssetBackfills.shift();
    if (!next) {
      return;
    }

    const key = assetBackfillKey(next.albumId, next.photoId);
    pendingAssetBackfillKeys.delete(key);
    if (activeAssetBackfillKeys.has(key)) {
      continue;
    }

    activeAssetBackfillKeys.add(key);
    activeAssetBackfills += 1;
    const photo = getPhotoById(next.albumId, next.photoId);
    const work = photo
      ? backfillAnalyzedPhotoAssets(
          next.albumId,
          {...photo, file: next.file},
          next.options,
        )
      : Promise.resolve();
    work
      .catch(error => {
        console.error('[CulledAlbum] Deferred asset backfill failed', error);
      })
      .finally(() => {
        activeAssetBackfillKeys.delete(key);
        activeAssetBackfills -= 1;
        pumpAssetBackfillQueue();
      });
  }
}

export function scheduleAnalyzedPhotoAssetsForPhoto(
  albumId: string,
  photoId: string,
  file: CulledAlbumPhoto['file'],
  options?: AnalyzedPhotoAssetsBackfillOptions,
): void {
  const key = assetBackfillKey(albumId, photoId);
  if (pendingAssetBackfillKeys.has(key) || activeAssetBackfillKeys.has(key)) {
    return;
  }

  pendingAssetBackfillKeys.add(key);
  pendingAssetBackfills.push({albumId, photoId, file, options});
  pumpAssetBackfillQueue();
}

export function clearScheduledAnalyzedPhotoAssets(albumId: string): void {
  for (let index = pendingAssetBackfills.length - 1; index >= 0; index -= 1) {
    if (pendingAssetBackfills[index].albumId !== albumId) {
      continue;
    }
    const [removed] = pendingAssetBackfills.splice(index, 1);
    pendingAssetBackfillKeys.delete(
      assetBackfillKey(removed.albumId, removed.photoId),
    );
  }
}

export async function ensureAnalyzedPhotoAssetsForPhoto(
  albumId: string,
  photoId: string,
  file: CulledAlbumPhoto['file'],
): Promise<void> {
  const photo = getPhotoById(albumId, photoId);
  if (!photo) {
    return;
  }

  await backfillAnalyzedPhotoAssets(albumId, {...photo, file});
}

export async function backfillMissingAnalyzedPhotoAssets(
  albumId: string,
  photos: CulledAlbumPhoto[],
  options?: AnalyzedPhotoAssetsBackfillOptions,
): Promise<void> {
  const regenerateFaceCrops = options?.regenerateFaceCrops ?? false;
  const pending = photos.filter(
    photo =>
      photo.analysisStatus === 'analyzed' &&
      (regenerateFaceCrops ||
        photo.faces.some(face => !face.cropUri) ||
        !photo.file.thumbnailUri),
  );

  for (let index = 0; index < pending.length; index += BACKFILL_CONCURRENCY) {
    const batch = pending.slice(index, index + BACKFILL_CONCURRENCY);
    await Promise.all(
      batch.map(photo =>
        backfillAnalyzedPhotoAssets(albumId, photo, options),
      ),
    );
  }
}
