import type {CulledAlbumPhoto} from '@lib/culledAlbum/types';
import {normalizeLookIntensityPercent} from '@lib/look/lookCatalog';
import {
  DEFAULT_LOOK_INTENSITY,
  hasAppliedLook,
  type LookId,
} from '@lib/look/types';
import {ensureExportStagingDirectory} from '@lib/export/nativeExport';
import {applyLookToJpeg} from '@lib/storage/localStorage';

export const LOOK_BAKE_CONCURRENCY = 4;
export const LOOK_PREVIEW_MAX_PIXEL_SIZE = 960;

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
  compressed: {maxPixelSize: 4096, jpegQuality: 0.95},
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

/** Display preview using the same LUT bake path as export (smaller pixel budget). */
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
