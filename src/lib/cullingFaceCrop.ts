import {APIResponse} from '@services/api';
import {FileAsset} from '@services/upload/types';

export type CullingBoundingBox = APIResponse.CullingFace['boundingBox'];

export function getFaceCropImageStyle(
  imageWidth: number,
  imageHeight: number,
  box: CullingBoundingBox,
  containerSize: number,
) {
  const cropX = box.left * imageWidth;
  const cropY = box.top * imageHeight;
  const cropW = Math.max(box.width * imageWidth, 1);
  const cropH = Math.max(box.height * imageHeight, 1);

  const scale = Math.max(containerSize / cropW, containerSize / cropH);

  return {
    width: imageWidth * scale,
    height: imageHeight * scale,
    marginLeft: -cropX * scale,
    marginTop: -cropY * scale,
  };
}

export function resolveKeyFaceSource(
  keyFace: APIResponse.CullingKeyFace,
  photos: APIResponse.CullingPhoto[],
  filesByPhotoId: Map<string, FileAsset>,
): {uri: string; boundingBox: CullingBoundingBox} | null {
  for (const photoId of keyFace.photoIds) {
    const photo = photos.find(entry => entry.photoId === photoId);
    const file = filesByPhotoId.get(photoId);
    if (!photo || !file) {
      continue;
    }

    const face = photo.faces.find(
      entry => entry.rekognitionFaceId === keyFace.faceId,
    );
    if (face) {
      return {uri: file.uri, boundingBox: face.boundingBox};
    }
  }

  for (const photoId of keyFace.photoIds) {
    const photo = photos.find(entry => entry.photoId === photoId);
    const file = filesByPhotoId.get(photoId);
    const face = photo?.faces[0];
    if (face && file) {
      return {uri: file.uri, boundingBox: face.boundingBox};
    }
  }

  return null;
}
