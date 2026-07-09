import {CulledPhoto} from '@/domain/entities/CulledPhoto';

export type PhotoStorageRow = {
  photoId: string;
  data: string;
  fileSize: number;
  uploadStatus: string;
  analysisStatus: string;
  serverUploadStatus: string;
};

export function photoStorageMetaFromPhoto(photo: CulledPhoto): Omit<
  PhotoStorageRow,
  'photoId' | 'data'
> {
  return {
    fileSize: photo.file.size ?? 0,
    uploadStatus: photo.status,
    analysisStatus: photo.analysisStatus,
    serverUploadStatus: photo.serverUploadStatus,
  };
}

export function photoStorageRowFromPhoto(photo: CulledPhoto): PhotoStorageRow {
  return {
    photoId: photo.photoId,
    data: JSON.stringify(photo.toPlain()),
    ...photoStorageMetaFromPhoto(photo),
  };
}

export function photoStorageMetaFromPlain(
  plain: Record<string, unknown>,
): Omit<PhotoStorageRow, 'photoId' | 'data'> {
  const file = plain.file as {size?: number} | undefined;
  return {
    fileSize: typeof file?.size === 'number' ? file.size : 0,
    uploadStatus: String(plain.status ?? 'pending'),
    analysisStatus: String(plain.analysisStatus ?? 'idle'),
    serverUploadStatus: String(plain.serverUploadStatus ?? 'idle'),
  };
}
