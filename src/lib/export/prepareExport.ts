import {ensureDetail, isUsableDetailUri} from '@lib/storage/localStorage';
import type {CulledAlbumPhoto} from '@lib/culledAlbum/types';
import {bakeLooksForPhotos, photoNeedsLookBake} from '@lib/look/bakeLook';
import {reportError} from '@lib/observability/reportError';
import {
  DISK_SPACE_MARGIN_BYTES,
  estimateExportBytes,
  hasEnoughDiskSpace,
} from './diskSpace';
import {
  copyExportFile,
  createZipFromEntries,
  ensureDefaultExportDirectory,
  ensureExportStagingDirectory,
  getFreeDiskSpace,
  resolveUniqueZipPath,
} from './nativeExport';
import {EXPORT_NATIVE_CODE_REASONS, ExportError} from './types';
import type {
  ExportFailureReason,
  ExportDirectoryInfo,
  ExportQuality,
  ExportZipEntry,
  ExportZipResult,
} from './types';

const NATIVE_CODE_REASONS = new Map<string, ExportFailureReason>(
  Object.entries(EXPORT_NATIVE_CODE_REASONS),
);

/** Single translation point: native reject (`code`, `userInfo.missingCount`) to ExportError. */
export function toExportError(error: unknown): ExportError {
  if (error instanceof ExportError) {
    return error;
  }
  const code = (error as {code?: unknown} | null)?.code;
  const reason =
    (typeof code === 'string' ? NATIVE_CODE_REASONS.get(code) : undefined) ??
    'unknown';
  const rawCount = (error as {userInfo?: {missingCount?: unknown}} | null)
    ?.userInfo?.missingCount;
  const missingCount =
    reason === 'sourceMissing' &&
    typeof rawCount === 'number' &&
    Number.isFinite(rawCount)
      ? rawCount
      : undefined;
  const message = error instanceof Error ? error.message : 'Export failed';
  return new ExportError(reason, message, {cause: error, missingCount});
}

async function assertDiskSpace(
  path: string,
  payloadBytes: number,
  context: Record<string, unknown>,
): Promise<void> {
  const requiredBytes = payloadBytes + DISK_SPACE_MARGIN_BYTES;
  let availableBytes: number;
  try {
    ({availableBytes} = await getFreeDiskSpace(path));
  } catch (error) {
    reportError(error, {...context, step: 'getFreeDiskSpace', requiredBytes});
    return;
  }
  if (!hasEnoughDiskSpace(availableBytes, payloadBytes)) {
    throw new ExportError('diskFull', 'Not enough disk space for export', {
      requiredBytes,
      context: {...context, availableBytes},
    });
  }
}

function stripUnsafeFileNameChars(value: string): string {
  let result = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 32) {
      continue;
    }
    if ('<>:"/\\|?*'.includes(char)) {
      continue;
    }
    result += char;
  }
  return result;
}

function sanitizeZipFileName(albumName: string): string {
  const cleaned = stripUnsafeFileNameChars(albumName)
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${cleaned || 'photo-album'}.zip`;
}

function toJpegEntryName(fileName: string, photoId: string): string {
  const base = fileName.replace(/\.[^.]+$/, '') || photoId;
  const safeBase = stripUnsafeFileNameChars(base).replace(/ /g, '_').trim() || photoId;
  return `${safeBase}.jpg`;
}

function uniquifyEntryNames(entries: ExportZipEntry[]): ExportZipEntry[] {
  const used = new Map<string, number>();
  return entries.map(entry => {
    const count = used.get(entry.name) ?? 0;
    used.set(entry.name, count + 1);
    if (count === 0) {
      return entry;
    }
    const extensionIndex = entry.name.lastIndexOf('.');
    if (extensionIndex <= 0) {
      return {...entry, name: `${entry.name}-${count + 1}`};
    }
    return {
      ...entry,
      name: `${entry.name.slice(0, extensionIndex)}-${count + 1}${entry.name.slice(extensionIndex)}`,
    };
  });
}

async function resolveExportSourceUri(
  albumId: string,
  photo: CulledAlbumPhoto,
  quality: ExportQuality,
  bakedUriByPhotoId?: Map<string, string>,
): Promise<string> {
  const bakedUri = bakedUriByPhotoId?.get(photo.photoId);
  if (bakedUri) {
    return bakedUri;
  }

  if (quality === 'original') {
    return photo.file.uri;
  }

  if (isUsableDetailUri(photo.file.detailUri)) {
    return photo.file.detailUri!;
  }

  const withDetail = await ensureDetail(albumId, photo.file, photo.photoId);
  if (isUsableDetailUri(withDetail.detailUri)) {
    return withDetail.detailUri!;
  }

  return photo.file.uri;
}

export type PrepareExportProgress = {
  completed: number;
  total: number;
  percent: number;
  phase?: 'applyingLook' | 'preparing';
};

export type PrepareExportOptions = {
  albumId: string;
  albumName: string;
  photos: CulledAlbumPhoto[];
  quality: ExportQuality;
  onProgress?: (progress: PrepareExportProgress) => void;
};

export type PreparedExport = ExportZipResult & {
  stagingPath: string;
};

export async function prepareSelectedPhotosExport(
  options: PrepareExportOptions,
): Promise<PreparedExport> {
  const {albumId, photos} = options;
  if (photos.length === 0) {
    throw new Error('No selected photos to export');
  }

  const stagingDirectory = await ensureExportStagingDirectory();
  const {totalBytes, missingSizeCount} = estimateExportBytes(photos);
  if (missingSizeCount > 0) {
    reportError(new Error('Export photos without size'), {
      albumId,
      missingSizeCount,
    });
  }
  await assertDiskSpace(stagingDirectory.path, totalBytes, {
    albumId,
    photoCount: photos.length,
  });
  try {
    return await buildExportZip(options, stagingDirectory.path);
  } catch (error) {
    throw toExportError(error);
  }
}

async function buildExportZip(
  options: PrepareExportOptions,
  stagingPath: string,
): Promise<PreparedExport> {
  const {albumId, albumName, photos, quality, onProgress} = options;
  const total = photos.length;
  const rawEntries: ExportZipEntry[] = [];

  const bakedUriByPhotoId = new Map<string, string>();
  const looksToBake = photos.filter(photoNeedsLookBake);
  if (looksToBake.length > 0) {
    const bakedByPhotoId = await bakeLooksForPhotos(
      looksToBake,
      quality,
      progress => {
        onProgress?.({
          completed: progress.completed,
          total: progress.total,
          percent: Math.min(40, Math.round((progress.percent / 100) * 40)),
          phase: 'applyingLook',
        });
      },
    );
    for (const [photoId, baked] of bakedByPhotoId) {
      bakedUriByPhotoId.set(photoId, baked.uri);
    }
  }

  for (let index = 0; index < photos.length; index++) {
    const photo = photos[index]!;
    const uri = await resolveExportSourceUri(
      albumId,
      photo,
      quality,
      bakedUriByPhotoId,
    );
    rawEntries.push({
      uri,
      name: toJpegEntryName(photo.file.name, photo.photoId),
    });
    const completed = index + 1;
    onProgress?.({
      completed,
      total,
      percent: 40 + Math.min(50, Math.round((completed / total) * 50)),
      phase: 'preparing',
    });
  }

  const entries = uniquifyEntryNames(rawEntries);
  onProgress?.({completed: total, total, percent: 92, phase: 'preparing'});

  const zipPath = await resolveUniqueZipPath(
    stagingPath,
    sanitizeZipFileName(albumName),
  );
  const zip = await createZipFromEntries(entries, zipPath);
  onProgress?.({completed: total, total, percent: 100, phase: 'preparing'});

  return {
    ...zip,
    stagingPath: zip.path,
    displayPath: 'Downloads / Gump',
    photoCount: photos.length,
  };
}

export async function downloadPreparedExport(options: {
  prepared: PreparedExport;
  directory?: ExportDirectoryInfo | null;
}): Promise<ExportZipResult> {
  const directory =
    options.directory ?? (await ensureDefaultExportDirectory());
  await assertDiskSpace(directory.path, options.prepared.byteSize, {
    photoCount: options.prepared.photoCount,
  });
  const destinationPath = await resolveUniqueZipPath(
    directory.path,
    options.prepared.fileName,
  );
  let copied: Awaited<ReturnType<typeof copyExportFile>>;
  try {
    copied = await copyExportFile(
      options.prepared.stagingPath,
      destinationPath,
    );
  } catch (error) {
    throw toExportError(error);
  }

  return {
    ...copied,
    displayPath: directory.displayPath,
    photoCount: options.prepared.photoCount,
  };
}
