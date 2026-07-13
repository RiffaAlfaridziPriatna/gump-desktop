import {CullingFace} from '@lib/culling/cullingUtil';
import {ensureFaceCrops} from '@lib/storage/localStorage';
import {FileAsset} from '@services/upload/types';

type AttachFaceCropUrisOptions = {
  regenerate?: boolean;
};

export async function attachFaceCropUris(
  albumId: string,
  photoId: string,
  file: FileAsset,
  faces: CullingFace[],
  options?: AttachFaceCropUrisOptions,
): Promise<CullingFace[]> {
  if (faces.length === 0) {
    return faces;
  }

  const regenerate = options?.regenerate ?? false;
  const pendingFaces = faces
    .map((face, faceIndex) => ({face, faceIndex}))
    .filter(({face}) => regenerate || !face.cropUri);

  if (pendingFaces.length === 0) {
    return faces;
  }

  const cropUris = await ensureFaceCrops(
    albumId,
    file.uri,
    photoId,
    pendingFaces.map(({face, faceIndex}) => ({
      faceIndex,
      boundingBox: face.boundingBox,
    })),
  );

  const cropUriByIndex = new Map<number, string>();
  pendingFaces.forEach(({faceIndex}, index) => {
    const cropUri = cropUris[index];
    if (cropUri) {
      cropUriByIndex.set(faceIndex, cropUri);
    }
  });

  if (cropUriByIndex.size === 0) {
    return faces;
  }

  return faces.map((face, faceIndex) => {
    const cropUri = cropUriByIndex.get(faceIndex) ?? face.cropUri;
    return cropUri ? {...face, cropUri} : face;
  });
}
