/** Look picker preview: the focused photo, else the first in grid order, else the first album photo. */
export function selectPreviewPhoto<T extends {photoId: string}>(
  albumPhotos: readonly T[],
  focusedPhoto: T | undefined,
  firstGridPhotoId: string | undefined,
): T | undefined {
  return (
    focusedPhoto ??
    albumPhotos.find(photo => photo.photoId === firstGridPhotoId) ??
    albumPhotos[0]
  );
}
