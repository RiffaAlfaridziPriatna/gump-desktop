import {CulledPhoto} from '../../src/domain/entities/CulledPhoto';
import {AlbumCover, CulledAlbum} from '../../src/domain/entities/CulledAlbum';
import {
  Face,
  FaceBounds,
  FaceLandmark,
  FacePose,
} from '../../src/domain/valueObjects/Face';
import {FileAsset} from '../../src/domain/valueObjects/FileAsset';
import {CulledAlbumPhoto} from '../../src/lib/culledAlbum/types';
import {APIResponse} from '../../src/services/api';
import {FileAsset as UploadFileAsset} from '../../src/services/upload/types';

export function makeCullingFace(
  overrides: Partial<APIResponse.CullingFace> = {},
): APIResponse.CullingFace {
  const box = overrides.boundingBox ?? {
    left: 0.2,
    top: 0.2,
    width: 0.3,
    height: 0.4,
  };
  const eyeLeftX = box.left + box.width * 0.3;
  const eyeRightX = box.left + box.width * 0.7;
  const eyeY = box.top + box.height * 0.35;
  const noseX = box.left + box.width * 0.5;
  const noseY = box.top + box.height * 0.55;
  const mouthX = noseX;
  const mouthY = box.top + box.height * 0.75;

  return {
    boundingBox: box,
    eyeStatus: 'open',
    eyeConfidence: 95,
    focusLevel: 'good',
    sharpness: 80,
    brightness: 50,
    landmarks: [
      {type: 'eyeLeft', x: eyeLeftX, y: eyeY},
      {type: 'eyeRight', x: eyeRightX, y: eyeY},
      {type: 'nose', x: noseX, y: noseY},
      {type: 'mouth', x: mouthX, y: mouthY},
    ],
    pose: {pitch: 0, roll: 0, yaw: 0},
    ...overrides,
  };
}

export function makeCullingPhoto(
  overrides: Partial<APIResponse.CullingPhoto> & {photoId: string},
): APIResponse.CullingPhoto {
  return {
    fileName: `${overrides.photoId}.JPG`,
    faces: [],
    selected: false,
    aiSelected: false,
    maybe: false,
    blurred: false,
    closedEyes: false,
    duplicated: false,
    starRating: 0,
    ...overrides,
  };
}

export function makeUploadFile(
  overrides: Partial<UploadFileAsset> = {},
): UploadFileAsset {
  return {
    uri: 'file:///tmp/photo.jpg',
    name: 'photo.jpg',
    size: 1024,
    type: 'image/jpeg',
    ...overrides,
  };
}

export function makeCulledAlbumPhoto(
  overrides: Partial<CulledAlbumPhoto> & {photoId: string},
): CulledAlbumPhoto {
  return {
    file: makeUploadFile({name: `${overrides.photoId}.jpg`}),
    uploadedAt: 1_000_000,
    capturedAt: 1_000_000,
    perceptualHash: null,
    progress: 0,
    status: 'uploaded',
    serverUploadStatus: 'idle',
    serverUploadProgress: 0,
    analysisProgress: 100,
    analysisStatus: 'analyzed',
    analysisEngineVersion: 'scrfd-ocec-15',
    faces: [],
    selected: false,
    starRating: 0,
    aiSelected: false,
    maybe: false,
    blurred: false,
    closedEyes: false,
    duplicated: false,
    ...overrides,
  };
}

export function makeDomainFile(
  overrides: Partial<ConstructorParameters<typeof FileAsset>[0]> = {},
): FileAsset {
  return new FileAsset({
    uri: 'file:///tmp/photo.jpg',
    name: 'photo.jpg',
    size: 2048,
    type: 'image/jpeg',
    ...overrides,
  });
}

export function makeDomainFace(
  overrides: Partial<ConstructorParameters<typeof Face>[0]> = {},
): Face {
  return new Face({
    bounds: new FaceBounds({left: 0.1, top: 0.1, width: 0.2, height: 0.3}),
    faceId: 'face-1',
    eyeStatus: 'open',
    eyeConfidence: 90,
    focusLevel: 'good',
    landmarks: [
      new FaceLandmark({type: 'nose', x: 0.2, y: 0.25}),
    ],
    pose: new FacePose({pitch: 0, roll: 0, yaw: 0}),
    sharpness: 80,
    brightness: 50,
    ...overrides,
  });
}

export function makeDomainPhoto(
  overrides: Partial<ConstructorParameters<typeof CulledPhoto>[0]> = {},
): CulledPhoto {
  return new CulledPhoto({
    photoId: 'photo-1',
    albumId: 'album-1',
    file: makeDomainFile(),
    ...overrides,
  });
}

export function makeDomainAlbum(
  overrides: Partial<ConstructorParameters<typeof CulledAlbum>[0]> = {},
): CulledAlbum {
  return new CulledAlbum({
    albumId: 'album-1',
    name: 'Wedding',
    cover: new AlbumCover({}),
    coverMobile: new AlbumCover({}),
    link: 'https://gump.app/a/album-1',
    ...overrides,
  });
}
