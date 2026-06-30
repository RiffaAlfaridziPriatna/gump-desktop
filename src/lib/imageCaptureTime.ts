import {getPhotoById, getPhotosForAlbum, updatePhoto} from '@lib/culledAlbum/store';
import {runTasksWithConcurrency} from '@lib/asyncPool';
import {readImageCaptureTime as readNativeImageCaptureTime} from '@lib/localStorage';

const MAX_CONCURRENT_CAPTURE_TIME_READS = 4;

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

export async function enrichMissingCaptureTimes(albumId: string): Promise<void> {
  const photosNeedingCaptureTime = getPhotosForAlbum(albumId).filter(
    photo => photo.capturedAt == null,
  );
  if (photosNeedingCaptureTime.length === 0) {
    return;
  }

  await runTasksWithConcurrency(
    photosNeedingCaptureTime,
    MAX_CONCURRENT_CAPTURE_TIME_READS,
    async photo => {
      const capturedAt = await readImageCaptureTime(photo.file.uri);
      if (capturedAt == null) {
        return;
      }

      updatePhoto(albumId, photo.photoId, entry => {
        entry.capturedAt = capturedAt;
      });
    },
  );
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
