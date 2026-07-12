import {APIResponse} from '@services/api';
import {FileAsset} from '@services/upload/types';
import {
  parseKeyFaceVariantId,
  resolveFaceClusterIdInPhoto,
} from '@lib/culling/cullingUtil';

export type CullingBoundingBox = APIResponse.CullingFace['boundingBox'];

export type DisplayRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export const FACE_CROP_SIDE_PADDING = 0.3;
export const FACE_CROP_TOP_PADDING = 0.3;
export const FACE_CROP_BOTTOM_PADDING = 0.5;
const FACE_CROP_ANCHOR_BOTTOM = 0.12;

type PaddedFaceCrop = {
  viewCenterX: number;
  anchorCenterY: number;
  viewW: number;
  viewH: number;
};

function getPaddedFaceCrop(
  imageWidth: number,
  imageHeight: number,
  box: CullingBoundingBox,
): PaddedFaceCrop {
  const cropX = box.left * imageWidth;
  const cropY = box.top * imageHeight;
  const cropW = Math.max(box.width * imageWidth, 1);
  const cropH = Math.max(box.height * imageHeight, 1);

  const viewLeft = cropX - FACE_CROP_SIDE_PADDING * cropW;
  const viewTop = cropY - FACE_CROP_TOP_PADDING * cropH;
  const viewW = cropW * (1 + 2 * FACE_CROP_SIDE_PADDING);
  const viewH = cropH * (1 + FACE_CROP_TOP_PADDING + FACE_CROP_BOTTOM_PADDING);
  const anchorCenterY =
    viewTop + (cropH * (1 + FACE_CROP_TOP_PADDING + FACE_CROP_ANCHOR_BOTTOM)) / 2;

  return {
    viewCenterX: viewLeft + viewW / 2,
    anchorCenterY,
    viewW,
    viewH,
  };
}

export function getContainedImageLayout(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
): DisplayRect {
  const scale = Math.min(
    containerWidth / imageWidth,
    containerHeight / imageHeight,
  );
  const width = imageWidth * scale;
  const height = imageHeight * scale;

  return {
    width,
    height,
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
  };
}

export function getFaceZoomImageLayout(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
  box: CullingBoundingBox,
): DisplayRect {
  const {viewCenterX, anchorCenterY, viewW, viewH} = getPaddedFaceCrop(
    imageWidth,
    imageHeight,
    box,
  );
  const scale = Math.min(
    containerWidth / viewW,
    containerHeight / viewH,
  );

  return {
    width: imageWidth * scale,
    height: imageHeight * scale,
    left: containerWidth / 2 - viewCenterX * scale,
    top: containerHeight / 2 - anchorCenterY * scale,
  };
}

export function boundingBoxToDisplayRect(
  box: CullingBoundingBox,
  imageLayout: DisplayRect,
): DisplayRect {
  return {
    left: imageLayout.left + box.left * imageLayout.width,
    top: imageLayout.top + box.top * imageLayout.height,
    width: box.width * imageLayout.width,
    height: box.height * imageLayout.height,
  };
}

export function getFaceCropImageStyle(
  imageWidth: number,
  imageHeight: number,
  box: CullingBoundingBox,
  containerSize: number,
) {
  const {viewCenterX, anchorCenterY, viewW, viewH} = getPaddedFaceCrop(
    imageWidth,
    imageHeight,
    box,
  );
  const scale = Math.min(containerSize / viewW, containerSize / viewH);

  return {
    width: imageWidth * scale,
    height: imageHeight * scale,
    left: containerSize / 2 - viewCenterX * scale,
    top: containerSize / 2 - anchorCenterY * scale,
  };
}

export function resolveKeyFaceSource(
  keyFace: APIResponse.CullingKeyFace,
  photos: APIResponse.CullingPhoto[],
  filesByPhotoId: Map<string, FileAsset>,
): {uri: string; boundingBox: CullingBoundingBox} | null {
  const parsed = parseKeyFaceVariantId(keyFace.faceId);
  if (parsed) {
    const photoIdSet = new Set(keyFace.photoIds);

    for (const photo of photos) {
      if (!photoIdSet.has(photo.photoId)) {
        continue;
      }

      const file = filesByPhotoId.get(photo.photoId);
      if (!file) {
        continue;
      }

      for (let index = 0; index < photo.faces.length; index++) {
        const face = photo.faces[index]!;
        if (
          face.eyeStatus !== keyFace.eyeStatus ||
          face.focusLevel !== keyFace.focusLevel
        ) {
          continue;
        }

        const clusterId = resolveFaceClusterIdInPhoto(
          face,
          photo.photoId,
          index,
          photo.faces,
        );
        if (clusterId !== parsed.clusterId) {
          continue;
        }

        return {uri: file.uri, boundingBox: face.boundingBox};
      }
    }

    return null;
  }

  const occurrenceMatch = /^(.+)#(\d+)$/.exec(keyFace.faceId);
  if (occurrenceMatch) {
    const photoId = occurrenceMatch[1]!;
    const faceIndex = Number(occurrenceMatch[2]);
    const photo = photos.find(entry => entry.photoId === photoId);
    const file = filesByPhotoId.get(photoId);
    const face = photo?.faces[faceIndex];
    if (face && file) {
      return {uri: file.uri, boundingBox: face.boundingBox};
    }
  }

  for (const photo of photos) {
    if (!keyFace.photoIds.includes(photo.photoId)) {
      continue;
    }

    const file = filesByPhotoId.get(photo.photoId);
    if (!file) {
      continue;
    }

    const face = photo.faces.find(
      entry => entry.rekognitionFaceId === keyFace.faceId,
    );
    if (face) {
      return {uri: file.uri, boundingBox: face.boundingBox};
    }
  }

  return null;
}

