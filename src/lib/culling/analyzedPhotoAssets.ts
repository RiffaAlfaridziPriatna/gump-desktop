import {syncPhotoFromStore} from '@/application/syncPhotoRepository';
import {getPhotoById, updatePhoto} from '@lib/culledAlbum/store';
import {CulledAlbumPhoto} from '@lib/culledAlbum/types';
import {ensureThumbnail} from '@lib/storage/localStorage';
import {attachFaceCropUris} from './faceCropThumbnails';

const BACKFILL_CONCURRENCY = 4;

export type AnalyzedPhotoAssetsBackfillOptions = {
  regenerateFaceCrops?: boolean;
};

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

export async function ensureAnalyzedPhotoAssetsForPhoto(
  albumId: string,
  photoId: string,
  file: CulledAlbumPhoto['file'],
): Promise<void> {
  const photo = getPhotoById(albumId, photoId);
  if (!photo || photo.analysisStatus !== 'analyzed') {
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
