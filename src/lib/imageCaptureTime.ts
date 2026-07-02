import {getPhotoById, updatePhoto} from '@lib/culledAlbum/store';
import {readImageCaptureTime as readNativeImageCaptureTime} from '@lib/localStorage';

export function parsePickerCaptureTime(timestamp?: string): number | null {
  if (!timestamp) {
    return null;
  }

  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function readImageCaptureTime(uri: string): Promise<number | null> {
  const timestamp = await readNativeImageCaptureTime(uri);
  if (timestamp == null || !Number.isFinite(timestamp)) {
    return null;
  }
  return timestamp;
}

export async function resolveImageCaptureTime(
  uri: string,
  pickerCaptureTime?: number | null,
): Promise<number | null> {
  if (pickerCaptureTime != null) {
    return pickerCaptureTime;
  }
  return readImageCaptureTime(uri);
}

export async function enrichPhotoCaptureTime(
  albumId: string,
  photoId: string,
  sourceUri: string,
  pickerCaptureTime?: number | null,
): Promise<number | null> {
  const existing = getPhotoById(albumId, photoId)?.capturedAt ?? null;
  if (existing != null) {
    return existing;
  }

  const capturedAt = await resolveImageCaptureTime(sourceUri, pickerCaptureTime);
  if (capturedAt == null) {
    return null;
  }

  updatePhoto(albumId, photoId, entry => {
    entry.capturedAt = capturedAt;
  });
  return capturedAt;
}
