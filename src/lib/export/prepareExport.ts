import {ensureDetail, isUsableDetailUri} from '@lib/storage/localStorage';
import type {CulledAlbumPhoto} from '@lib/culledAlbum/types';
import {
  copyExportFile,
  createZipFromEntries,
  ensureDefaultExportDirectory,
  ensureExportStagingDirectory,
  resolveUniqueZipPath,
} from './nativeExport';
import type {
  ExportDirectoryInfo,
  ExportQuality,
  ExportZipEntry,
  ExportZipResult,
} from './types';

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
): Promise<string> {
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
  const {albumId, albumName, photos, quality, onProgress} = options;
  if (photos.length === 0) {
    throw new Error('No selected photos to export');
  }

  const stagingDirectory = await ensureExportStagingDirectory();
  const total = photos.length;
  const rawEntries: ExportZipEntry[] = [];

  for (let index = 0; index < photos.length; index++) {
    const photo = photos[index]!;
    const uri = await resolveExportSourceUri(albumId, photo, quality);
    rawEntries.push({
      uri,
      name: toJpegEntryName(photo.file.name, photo.photoId),
    });
    const completed = index + 1;
    onProgress?.({
      completed,
      total,
      percent: Math.min(90, Math.round((completed / total) * 90)),
    });
  }

  const entries = uniquifyEntryNames(rawEntries);
  onProgress?.({completed: total, total, percent: 92});

  const zipPath = await resolveUniqueZipPath(
    stagingDirectory.path,
    sanitizeZipFileName(albumName),
  );
  const zip = await createZipFromEntries(entries, zipPath);
  onProgress?.({completed: total, total, percent: 100});

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
  const destinationPath = await resolveUniqueZipPath(
    directory.path,
    options.prepared.fileName,
  );
  const copied = await copyExportFile(options.prepared.stagingPath, destinationPath);

  return {
    ...copied,
    displayPath: directory.displayPath,
    photoCount: options.prepared.photoCount,
  };
}
