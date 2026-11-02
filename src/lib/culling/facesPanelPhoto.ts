import type {FacesInPhotoPanelPhoto} from '@components/culling/FacesInPhotoPanel';
import type {CulledAlbumPhoto} from '@lib/culledAlbum/types';
import {resolveKeyFaceDisplayUri} from '@lib/storage/localStorage';

export function toFacesPanelPhoto(
  photo: Pick<CulledAlbumPhoto, 'photoId' | 'file' | 'faces'>,
): FacesInPhotoPanelPhoto {
  return {
    photoId: photo.photoId,
    fileName: photo.file.name,
    uri: resolveKeyFaceDisplayUri(photo.file),
    faces: photo.faces.map((face, index) => ({
      faceId: face.rekognitionFaceId ?? `${photo.photoId}-${index}`,
      bounds: face.boundingBox,
      eyeStatus: face.eyeStatus,
      focusLevel: face.focusLevel,
    })),
  };
}
