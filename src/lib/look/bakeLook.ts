import type {CulledAlbumPhoto} from '@lib/culledAlbum/types';
import {
  resolveCustomLookBake,
  type CustomLookSource,
} from '@lib/look/customLookFile';
import {resolveLookFinishing} from '@lib/look/lookCatalog';
import {
  LOOK_BAKE_INTENSITY,
  hasAppliedLook,
  type LookId,
} from '@lib/look/types';
import {ensureExportStagingDirectory} from '@lib/export/nativeExport';
import {
  applyLookToJpeg,
  getLocalFileByteSize,
} from '@lib/storage/localStorage';
import {reportError} from '@lib/observability/reportError';
import type {FileAsset} from '@services/upload/types';

export type {CustomLookSource} from '@lib/look/customLookFile';

export const LOOK_BAKE_CONCURRENCY = 4;
export const LOOK_PREVIEW_MAX_PIXEL_SIZE = 960;
export const LOOK_DETAIL_MAX_PIXEL_SIZE = 4096;

export type BakeLookQuality = 'compressed' | 'original' | 'preview';

export type BakeLookProgress = {
  completed: number;
  total: number;
  percent: number;
};

export type BakedLookResult = {
  photoId: string;
  uri: string;
  path?: string;
  /** Byte length of the baked JPEG (required for multipart upload sessions). */
  size: number;
};

export const QUALITY_SETTINGS: Record<
  BakeLookQuality,
  {maxPixelSize: number; jpegQuality: number}
> = {
  compressed: {maxPixelSize: LOOK_DETAIL_MAX_PIXEL_SIZE, jpegQuality: 0.95},
  original: {maxPixelSize: 12000, jpegQuality: 0.97},
  preview: {maxPixelSize: LOOK_PREVIEW_MAX_PIXEL_SIZE, jpegQuality: 0.88},
};

export function stripUnsafeFileNameChars(value: string): string {
  let result = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 32 || '<>:"/\\|?*'.includes(char)) {
      continue;
    }
    result += char;
  }
  return result || 'photo';
}

/** Built-ins keep their bare id so existing keys and bake files stay valid. */
export function lookKeyPart(lookId: LookId, revision?: string): string {
  return lookId === 'custom' ? `custom-${revision ?? ''}` : lookId;
}

export function hasBakeableLook(lookId: LookId, revision?: string): boolean {
  return hasAppliedLook(lookId) || (lookId === 'custom' && !!revision);
}

/** Cache key stored on FileAsset.lookDetailKey for a 4096 look bake. */
export function lookDetailCacheKey(lookId: LookId, revision?: string): string {
  return `${lookKeyPart(lookId, revision)}|${LOOK_BAKE_INTENSITY}|${LOOK_DETAIL_MAX_PIXEL_SIZE}`;
}

export function isUsableLookDetailUri(
  lookDetailUri: string | null | undefined,
): lookDetailUri is string {
  return typeof lookDetailUri === 'string' && lookDetailUri.length > 0;
}

export function isLookDetailCurrent(
  file: Pick<FileAsset, 'lookDetailUri' | 'lookDetailKey'>,
  lookId: LookId,
  revision?: string,
): boolean {
  if (!hasBakeableLook(lookId, revision)) {
    return false;
  }
  if (!isUsableLookDetailUri(file.lookDetailUri) || !file.lookDetailKey) {
    return false;
  }
  return file.lookDetailKey === lookDetailCacheKey(lookId, revision);
}

/** True for 'custom' too: a photo whose album lost its preset reports and bakes as original. */
export function photoNeedsLookBake(photo: CulledAlbumPhoto): boolean {
  return hasAppliedLook(photo.lookId) || photo.lookId === 'custom';
}

export async function resolveBakeDestinationPath(
  photo: CulledAlbumPhoto,
  quality: BakeLookQuality,
  revision?: string,
): Promise<string> {
  const staging = await ensureExportStagingDirectory();
  const settings = QUALITY_SETTINGS[quality];
  const safeId = stripUnsafeFileNameChars(photo.photoId);
  const fileName = `${safeId}-${lookKeyPart(photo.lookId, revision)}-${LOOK_BAKE_INTENSITY}-${settings.maxPixelSize}.jpg`;
  const separator = staging.path.includes('\\') ? '\\' : '/';
  return `${staging.path}${separator}looks${separator}${fileName}`;
}

function originalResult(photo: CulledAlbumPhoto): BakedLookResult {
  return {photoId: photo.photoId, uri: photo.file.uri, size: photo.file.size};
}

/** `custom` is the album's preset; required for a 'custom' photo to bake with it. */
export async function bakePhotoLook(
  photo: CulledAlbumPhoto,
  quality: BakeLookQuality = 'compressed',
  custom?: CustomLookSource,
): Promise<BakedLookResult> {
  if (!photoNeedsLookBake(photo)) {
    return originalResult(photo);
  }
  const customBake =
    photo.lookId === 'custom'
      ? resolveCustomLookBake(photo.file.uri, custom)
      : null;
  if (photo.lookId === 'custom' && !customBake) {
    reportError(new Error('Custom look photo without an album preset'), {
      source: 'bake_look',
      albumId: custom?.albumId ?? null,
      photoId: photo.photoId,
    });
    return originalResult(photo);
  }

  const settings = QUALITY_SETTINGS[quality];
  const destPath = await resolveBakeDestinationPath(
    photo,
    quality,
    customBake?.revision,
  );
  const baked = await applyLookToJpeg({
    sourceUri: photo.file.uri,
    destPath,
    lookId: photo.lookId,
    maxPixelSize: settings.maxPixelSize,
    jpegQuality: settings.jpegQuality,
    finishing: customBake
      ? customBake.finishing
      : resolveLookFinishing(photo.lookId),
    lutPath: customBake?.lutPath,
  });

  if (!baked.uri) {
    throw new Error(`Failed to apply look to ${photo.file.name}`);
  }

  const size =
    typeof baked.size === 'number' && baked.size > 0
      ? baked.size
      : await getLocalFileByteSize(baked.uri);

  return {
    photoId: photo.photoId,
    uri: baked.uri,
    path: baked.path ?? undefined,
    size,
  };
}

/**
 * Ensure a 4096 look-baked detail exists for this photo (like ensureDetail).
 * Returns the URI + key to store on FileAsset; no-op when look is original.
 */
export async function ensureLookDetail(
  photo: CulledAlbumPhoto,
  custom?: CustomLookSource,
): Promise<{lookDetailUri: string | null; lookDetailKey: string | null}> {
  const revision =
    photo.lookId === 'custom' ? custom?.customLook?.revision : undefined;
  if (!hasBakeableLook(photo.lookId, revision)) {
    return {lookDetailUri: null, lookDetailKey: null};
  }

  const key = lookDetailCacheKey(photo.lookId, revision);
  if (isLookDetailCurrent(photo.file, photo.lookId, revision)) {
    return {
      lookDetailUri: photo.file.lookDetailUri!,
      lookDetailKey: key,
    };
  }

  const baked = await bakePhotoLook(photo, 'compressed', custom);
  return {
    lookDetailUri: baked.uri,
    lookDetailKey: key,
  };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  onItemDone?: (completed: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let completed = 0;
  const total = items.length;

  async function runWorker(): Promise<void> {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index]!, index);
      completed += 1;
      onItemDone?.(completed, total);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(
    Array.from({length: workerCount}, () => runWorker()),
  );
  return results;
}

export async function bakeLooksForPhotos(
  photos: CulledAlbumPhoto[],
  quality: BakeLookQuality = 'compressed',
  onProgress?: (progress: BakeLookProgress) => void,
  custom?: CustomLookSource,
): Promise<Map<string, BakedLookResult>> {
  const resultByPhotoId = new Map<string, BakedLookResult>();
  const needingBake = photos.filter(photoNeedsLookBake);
  const total = needingBake.length;

  if (total === 0) {
    onProgress?.({completed: 0, total: 0, percent: 100});
    return resultByPhotoId;
  }

  onProgress?.({completed: 0, total, percent: 0});

  const baked = await mapPool(
    needingBake,
    LOOK_BAKE_CONCURRENCY,
    async photo => bakePhotoLook(photo, quality, custom),
    (completed, bakeTotal) => {
      onProgress?.({
        completed,
        total: bakeTotal,
        percent: Math.round((completed / bakeTotal) * 100),
      });
    },
  );

  for (const result of baked) {
    resultByPhotoId.set(result.photoId, result);
  }
  return resultByPhotoId;
}
