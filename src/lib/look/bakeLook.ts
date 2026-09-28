import type {CulledAlbumPhoto} from '@lib/culledAlbum/types';
import {normalizeLookIntensityPercent} from '@lib/look/lookCatalog';
import {
  DEFAULT_LOOK_INTENSITY,
  hasAppliedLook,
  type LookId,
} from '@lib/look/types';
import {ensureExportStagingDirectory} from '@lib/export/nativeExport';
import {applyLookToJpeg} from '@lib/storage/localStorage';
import type {FileAsset} from '@services/upload/types';

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
};

const QUALITY_SETTINGS: Record<
  BakeLookQuality,
  {maxPixelSize: number; jpegQuality: number}
> = {
  compressed: {maxPixelSize: LOOK_DETAIL_MAX_PIXEL_SIZE, jpegQuality: 0.95},
  original: {maxPixelSize: 12000, jpegQuality: 0.97},
  preview: {maxPixelSize: LOOK_PREVIEW_MAX_PIXEL_SIZE, jpegQuality: 0.88},
};

const previewUriCache = new Map<string, string>();

function stripUnsafeFileNameChars(value: string): string {
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

function previewCacheKey(
  sourceUri: string,
  lookId: LookId,
  intensity: number,
  maxPixelSize: number,
): string {
  return `${sourceUri}|${lookId}|${intensity}|${maxPixelSize}`;
}

/** Cache key stored on FileAsset.lookDetailKey for a 4096 look bake. */
export function lookDetailCacheKey(
  lookId: LookId,
  intensityPercent: number,
): string {
  const intensity = normalizeLookIntensityPercent(intensityPercent);
  return `${lookId}|${intensity}|${LOOK_DETAIL_MAX_PIXEL_SIZE}`;
}

export function isUsableLookDetailUri(
  lookDetailUri: string | null | undefined,
): lookDetailUri is string {
  return typeof lookDetailUri === 'string' && lookDetailUri.length > 0;
}

export function isLookDetailCurrent(
  file: Pick<FileAsset, 'lookDetailUri' | 'lookDetailKey'>,
  lookId: LookId,
  intensityPercent: number,
): boolean {
  if (!hasAppliedLook(lookId)) {
    return false;
  }
  if (!isUsableLookDetailUri(file.lookDetailUri) || !file.lookDetailKey) {
    return false;
  }
  return file.lookDetailKey === lookDetailCacheKey(lookId, intensityPercent);
}

export function photoNeedsLookBake(photo: CulledAlbumPhoto): boolean {
  return hasAppliedLook(photo.lookId);
}

export async function resolveBakeDestinationPath(
  photo: CulledAlbumPhoto,
  quality: BakeLookQuality,
): Promise<string> {
  const staging = await ensureExportStagingDirectory();
  const settings = QUALITY_SETTINGS[quality];
  const safeId = stripUnsafeFileNameChars(photo.photoId);
  const intensity = normalizeLookIntensityPercent(photo.lookIntensity);
  const fileName = `${safeId}-${photo.lookId}-${intensity}-${settings.maxPixelSize}.jpg`;
  const separator = staging.path.includes('\\') ? '\\' : '/';
  return `${staging.path}${separator}looks${separator}${fileName}`;
}

async function resolvePreviewDestinationPath(
  sourceUri: string,
  lookId: LookId,
  intensity: number,
): Promise<string> {
  const staging = await ensureExportStagingDirectory();
  const settings = QUALITY_SETTINGS.preview;
  const hash = stripUnsafeFileNameChars(
    sourceUri.replace(/[^a-zA-Z0-9]+/g, '').slice(-48) || 'preview',
  );
  const fileName = `preview-${hash}-${lookId}-${intensity}-${settings.maxPixelSize}.jpg`;
  const separator = staging.path.includes('\\') ? '\\' : '/';
  return `${staging.path}${separator}looks${separator}${fileName}`;
}

export async function bakePhotoLook(
  photo: CulledAlbumPhoto,
  quality: BakeLookQuality = 'compressed',
): Promise<BakedLookResult> {
  if (!photoNeedsLookBake(photo)) {
    return {photoId: photo.photoId, uri: photo.file.uri};
  }

  const settings = QUALITY_SETTINGS[quality];
  const intensity = normalizeLookIntensityPercent(
    photo.lookIntensity ?? DEFAULT_LOOK_INTENSITY,
  );
  const destPath = await resolveBakeDestinationPath(photo, quality);
  const baked = await applyLookToJpeg({
    sourceUri: photo.file.uri,
    destPath,
    lookId: photo.lookId as LookId,
    intensity,
    maxPixelSize: settings.maxPixelSize,
    jpegQuality: settings.jpegQuality,
  });

  if (!baked.uri) {
    throw new Error(`Failed to apply look to ${photo.file.name}`);
  }

  return {
    photoId: photo.photoId,
    uri: baked.uri,
    path: baked.path ?? undefined,
  };
}

/**
 * Ensure a 4096 look-baked detail exists for this photo (like ensureDetail).
 * Returns the URI + key to store on FileAsset; no-op when look is original.
 */
export async function ensureLookDetail(
  photo: CulledAlbumPhoto,
): Promise<{lookDetailUri: string | null; lookDetailKey: string | null}> {
  if (!hasAppliedLook(photo.lookId)) {
    return {lookDetailUri: null, lookDetailKey: null};
  }

  const intensity = normalizeLookIntensityPercent(
    photo.lookIntensity ?? DEFAULT_LOOK_INTENSITY,
  );
  const key = lookDetailCacheKey(photo.lookId, intensity);
  if (isLookDetailCurrent(photo.file, photo.lookId, intensity)) {
    return {
      lookDetailUri: photo.file.lookDetailUri!,
      lookDetailKey: key,
    };
  }

  const baked = await bakePhotoLook(photo, 'compressed');
  return {
    lookDetailUri: baked.uri,
    lookDetailKey: key,
  };
}

/** Display preview using the same native .cube LUT bake path as export (smaller pixel budget). */
export async function bakeLookPreviewUri(
  sourceUri: string,
  lookId: LookId,
  intensityPercent: number = DEFAULT_LOOK_INTENSITY,
): Promise<string> {
  if (!sourceUri || !hasAppliedLook(lookId)) {
    return sourceUri;
  }

  const intensity = normalizeLookIntensityPercent(intensityPercent);
  if (intensity <= 0) {
    return sourceUri;
  }

  const settings = QUALITY_SETTINGS.preview;
  const key = previewCacheKey(
    sourceUri,
    lookId,
    intensity,
    settings.maxPixelSize,
  );
  const cached = previewUriCache.get(key);
  if (cached) {
    return cached;
  }

  const destPath = await resolvePreviewDestinationPath(
    sourceUri,
    lookId,
    intensity,
  );
  const baked = await applyLookToJpeg({
    sourceUri,
    destPath,
    lookId,
    intensity,
    maxPixelSize: settings.maxPixelSize,
    jpegQuality: settings.jpegQuality,
  });

  if (!baked.uri) {
    throw new Error('Failed to bake look preview');
  }

  previewUriCache.set(key, baked.uri);
  return baked.uri;
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
): Promise<Map<string, string>> {
  const uriByPhotoId = new Map<string, string>();
  const needingBake = photos.filter(photoNeedsLookBake);
  const total = needingBake.length;

  if (total === 0) {
    onProgress?.({completed: 0, total: 0, percent: 100});
    return uriByPhotoId;
  }

  onProgress?.({completed: 0, total, percent: 0});

  const baked = await mapPool(
    needingBake,
    LOOK_BAKE_CONCURRENCY,
    async photo => bakePhotoLook(photo, quality),
    (completed, bakeTotal) => {
      onProgress?.({
        completed,
        total: bakeTotal,
        percent: Math.round((completed / bakeTotal) * 100),
      });
    },
  );

  for (const result of baked) {
    uriByPhotoId.set(result.photoId, result.uri);
  }
  return uriByPhotoId;
}
