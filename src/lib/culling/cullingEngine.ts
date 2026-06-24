import {deleteLocalPhotoFile} from '@lib/localStorage';
import {purgeLocalCulledAlbum} from '@lib/culledAlbum/service';
import {
  ensureAlbumLoaded,
  getAlbum,
  getPhotoById,
  getPhotosForAlbum,
  persistAlbum,
  removePhotoFromAlbum,
  updatePhoto,
} from '@lib/culledAlbum/store';
import {toCullingPhoto, isCulledPhotoDisabled} from '@lib/culledAlbum/types';
import {APIResponse} from '@services/api';
import {FileAsset} from '@services/upload/types';
import {NativeModules, Platform} from 'react-native';
import {
  classifyEyeStatus,
  classifyFocus,
  clusterFacesAcrossPhotos,
  computeKeyFaces,
  computeStats,
  CullingFace,
  CullingPhoto,
  derivePhotoFlags,
  deriveStarRating,
  detectDuplicates,
} from './cullingUtil';
import {NativeDetectedFace} from '@lib/culledAlbum/types';

type NativeLocalStorageModule = {
  detectFacesForCulling: (uri: string) => Promise<NativeDetectedFace[]>;
};

const NativeLocalStorage = NativeModules.GumpLocalStorage as
  | NativeLocalStorageModule
  | undefined;

function mapNativeFace(
  face: NativeDetectedFace,
  photoId: string,
  index: number,
): CullingFace {
  const sharpness = face.sharpness ?? 0;

  return {
    boundingBox: face.boundingBox,
    eyeStatus: classifyEyeStatus(face.eyesOpen),
    eyeConfidence: face.eyesOpen?.confidence ?? 0,
    focusLevel: classifyFocus(sharpness),
    sharpness,
    brightness: face.brightness ?? 0,
    landmarks: face.landmarks ?? [],
    pose: face.pose ?? {pitch: 0, roll: 0, yaw: 0},
    rekognitionFaceId: `${photoId}-${face.faceId ?? index}`,
  };
}

const ANALYSIS_TIMEOUT_MS = 60_000;

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
      ms,
    );
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

interface PlatformDetector {
  detectFaces(uri: string, photoId: string): Promise<CullingFace[]>;
}

class MacOSDetector implements PlatformDetector {
  async detectFaces(uri: string, photoId: string): Promise<CullingFace[]> {
    if (!NativeLocalStorage?.detectFacesForCulling) {
      throw new Error('macOS native module not available');
    }
    const faces = await NativeLocalStorage.detectFacesForCulling(uri);
    return faces.map((face, index) => mapNativeFace(face, photoId, index));
  }
}

class IOSDetector implements PlatformDetector {
  async detectFaces(uri: string, photoId: string): Promise<CullingFace[]> {
    if (!NativeLocalStorage?.detectFacesForCulling) {
      throw new Error('iOS native module not available');
    }
    const faces = await NativeLocalStorage.detectFacesForCulling(uri);
    return faces.map((face, index) => mapNativeFace(face, photoId, index));
  }
}

class AndroidDetector implements PlatformDetector {
  async detectFaces(uri: string, photoId: string): Promise<CullingFace[]> {
    if (!NativeLocalStorage?.detectFacesForCulling) {
      throw new Error('Android native module not available');
    }
    const faces = await NativeLocalStorage.detectFacesForCulling(uri);
    return faces.map((face, index) => mapNativeFace(face, photoId, index));
  }
}

class WindowsDetector implements PlatformDetector {
  async detectFaces(uri: string, photoId: string): Promise<CullingFace[]> {
    if (!NativeLocalStorage?.detectFacesForCulling) {
      throw new Error('Windows native module not available');
    }
    const faces = await NativeLocalStorage.detectFacesForCulling(uri);
    return faces.map((face, index) => mapNativeFace(face, photoId, index));
  }
}

class FallbackDetector implements PlatformDetector {
  async detectFaces(_uri: string, photoId: string): Promise<CullingFace[]> {
    return [
      {
        boundingBox: {left: 0.35, top: 0.1, width: 0.3, height: 0.4},
        eyeStatus: 'partial',
        eyeConfidence: 60,
        focusLevel: 'soft',
        sharpness: 50,
        brightness: 60,
        landmarks: [{type: 'eyeLeft', x: 0.4, y: 0.3}],
        pose: {pitch: 0, roll: 0, yaw: 0},
        rekognitionFaceId: `local-${photoId}-0`,
      },
    ];
  }
}

function createPlatformDetector(): PlatformDetector {
  switch (Platform.OS) {
    case 'macos':
      return new MacOSDetector();
    case 'ios':
      return new IOSDetector();
    case 'android':
      return new AndroidDetector();
    case 'windows':
      return new WindowsDetector();
    default:
      return new FallbackDetector();
  }
}

const detector = createPlatformDetector();

async function getAnalyzedPhotos(albumId: string): Promise<CullingPhoto[]> {
  await ensureAlbumLoaded(albumId);
  return getPhotosForAlbum(albumId)
    .filter(photo => photo.analysisStatus === 'analyzed')
    .map(toCullingPhoto);
}

function applyDuplicateFlags(albumId: string): void {
  const photos = getPhotosForAlbum(albumId)
    .filter(photo => photo.analysisStatus === 'analyzed')
    .map(toCullingPhoto);
  const photoMap = Object.fromEntries(
    photos.map(photo => [photo.photoId, photo]),
  );
  detectDuplicates(photoMap);
  for (const photo of Object.values(photoMap)) {
    updatePhoto(albumId, photo.photoId, entry => {
      entry.duplicated = photo.duplicated;
    });
  }
}

function assignFaceClusterIds(albumId: string): void {
  const photos = getPhotosForAlbum(albumId)
    .filter(photo => photo.analysisStatus === 'analyzed')
    .map(toCullingPhoto);
  const clusterMap = clusterFacesAcrossPhotos(photos);

  for (const photo of photos) {
    updatePhoto(albumId, photo.photoId, entry => {
      entry.faces.forEach((face, faceIndex) => {
        const clusterId = clusterMap.get(`${photo.photoId}:${faceIndex}`);
        if (clusterId) {
          face.rekognitionFaceId = clusterId;
        }
      });
    });
  }
}

export const cullingEngine = {
  async analyzePhoto(
    albumId: string,
    photoId: string,
    file: FileAsset,
  ): Promise<APIResponse.CullingPhoto> {
    const faces = await withTimeout(
      detector.detectFaces(file.uri, photoId),
      ANALYSIS_TIMEOUT_MS,
      'Face detection',
    );
    const flags = derivePhotoFlags(faces);

    const existing = getPhotosForAlbum(albumId).find(
      photo => photo.photoId === photoId,
    );
    if (!existing) {
      throw new Error('Photo not found in album store');
    }

    const isFirstAnalysis = existing.faces.length === 0;
    const initialStarRating =
      existing.starRating ?? deriveStarRating(faces);
    const aiSelected = isFirstAnalysis
      ? initialStarRating === 5
      : existing.aiSelected;

    updatePhoto(albumId, photoId, photo => {
      photo.faces = faces;
      photo.aiSelected = aiSelected;
      photo.maybe = flags.maybe;
      photo.blurred = flags.blurred;
      photo.closedEyes = flags.closedEyes;
      photo.duplicated = existing.duplicated ?? false;
      photo.starRating = initialStarRating;
      photo.selected = isFirstAnalysis
        ? initialStarRating === 5
        : existing.selected;
    });

    await persistAlbum(albumId);

    const updated = getPhotoById(albumId, photoId);
    if (!updated) {
      throw new Error('Photo analysis not found');
    }
    return toCullingPhoto(updated);
  },

  async getPhotos(albumId: string): Promise<APIResponse.CullingPhotoList> {
    return {results: await getAnalyzedPhotos(albumId)};
  },

  async getStats(albumId: string): Promise<APIResponse.CullingStats> {
    return computeStats(await getAnalyzedPhotos(albumId));
  },

  async getKeyFaces(albumId: string): Promise<APIResponse.CullingKeyFaceList> {
    await ensureAlbumLoaded(albumId);
    assignFaceClusterIds(albumId);
    await persistAlbum(albumId);
    return {results: computeKeyFaces(await getAnalyzedPhotos(albumId))};
  },

  async updateSelection(
    albumId: string,
    photoId: string,
    data: {selected?: boolean; starRating?: number | null},
  ): Promise<APIResponse.CullingPhoto> {
    await ensureAlbumLoaded(albumId);
    const existing = getPhotoById(albumId, photoId);
    if (!existing) {
      throw new Error('Photo analysis not found');
    }
    const album = getAlbum(albumId);
    if (isCulledPhotoDisabled(existing, album?.cullingHasUploads ?? false)) {
      throw new Error('Cannot modify uploaded photo');
    }
    const updated = updatePhoto(albumId, photoId, photo => {
      if (data.selected !== undefined) {
        photo.selected = data.selected;
      }
      if (data.starRating !== undefined) {
        photo.starRating = data.starRating;
      }
    });
    if (!updated) {
      throw new Error('Photo analysis not found');
    }
    await persistAlbum(albumId);
    const photo = getPhotoById(albumId, photoId);
    if (!photo) {
      throw new Error('Photo analysis not found');
    }
    return toCullingPhoto(photo);
  },

  async updateStarRating(
    albumId: string,
    photoId: string,
    starRating: number,
  ): Promise<APIResponse.CullingPhoto> {
    return this.updateSelection(albumId, photoId, {starRating});
  },

  async deletePhoto(albumId: string, photoId: string): Promise<void> {
    await ensureAlbumLoaded(albumId);
    const photo = getPhotoById(albumId, photoId);
    if (!photo) {
      throw new Error('Photo not found');
    }
    const album = getAlbum(albumId);
    if (isCulledPhotoDisabled(photo, album?.cullingHasUploads ?? false)) {
      throw new Error('Cannot delete uploaded photo');
    }

    const removed = removePhotoFromAlbum(albumId, photoId);
    if (!removed) {
      throw new Error('Photo analysis not found');
    }

    await deleteLocalPhotoFile(photo.file.uri);
    await persistAlbum(albumId);

    const remaining = await getAnalyzedPhotos(albumId);
    if (remaining.length > 0) {
      applyDuplicateFlags(albumId);
      await persistAlbum(albumId);
    }
  },

  async completeAnalysis(albumId: string): Promise<void> {
    const photos = await getAnalyzedPhotos(albumId);
    if (photos.length === 0) {
      throw new Error('No analyzed photos');
    }
    applyDuplicateFlags(albumId);
    assignFaceClusterIds(albumId);
    await persistAlbum(albumId);
  },

  async finalize(
    albumId: string,
  ): Promise<APIResponse.CullingFinalizeResult> {
    const photos = await getAnalyzedPhotos(albumId);
    const selectedPhotoIds = photos
      .filter(photo => photo.selected)
      .map(photo => photo.photoId);
    return {selectedPhotoIds};
  },

  async clearAlbum(albumId: string): Promise<void> {
    await purgeLocalCulledAlbum(albumId);
  },
};

export type {CullingPhoto};
