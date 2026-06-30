import {getPhotoById, getPhotosForAlbum, updatePhoto} from '@lib/culledAlbum/store';
import {runTasksWithConcurrency} from '@lib/asyncPool';
import {computePerceptualHash as computeNativePerceptualHash} from '@lib/localStorage';

const MAX_CONCURRENT_HASH_COMPUTATIONS = 4;

export function hammingDistance(hexA: string, hexB: string): number {
  const valueA = BigInt(`0x${hexA}`);
  const valueB = BigInt(`0x${hexB}`);
  let xor = valueA ^ valueB;
  let distance = 0;

  while (xor > 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }

  return distance;
}

export async function computeImagePerceptualHash(
  uri: string,
): Promise<string | null> {
  const hash = await computeNativePerceptualHash(uri);
  if (!hash || !/^[0-9a-f]{16}$/i.test(hash)) {
    return null;
  }
  return hash.toLowerCase();
}

export async function enrichMissingPerceptualHashes(
  albumId: string,
): Promise<void> {
  const photosNeedingHash = getPhotosForAlbum(albumId).filter(
    photo => photo.perceptualHash == null,
  );
  if (photosNeedingHash.length === 0) {
    return;
  }

  await runTasksWithConcurrency(
    photosNeedingHash,
    MAX_CONCURRENT_HASH_COMPUTATIONS,
    async photo => {
      const perceptualHash = await computeImagePerceptualHash(photo.file.uri);
      if (perceptualHash == null) {
        return;
      }

      updatePhoto(albumId, photo.photoId, entry => {
        entry.perceptualHash = perceptualHash;
      });
    },
  );
}

export async function enrichPhotoPerceptualHash(
  albumId: string,
  photoId: string,
  sourceUri: string,
): Promise<string | null> {
  const existing = getPhotoById(albumId, photoId)?.perceptualHash ?? null;
  if (existing != null) {
    return existing;
  }

  const perceptualHash = await computeImagePerceptualHash(sourceUri);
  if (perceptualHash == null) {
    return null;
  }

  updatePhoto(albumId, photoId, entry => {
    entry.perceptualHash = perceptualHash;
  });
  return perceptualHash;
}
