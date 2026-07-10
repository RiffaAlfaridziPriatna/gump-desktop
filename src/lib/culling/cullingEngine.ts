import {syncPhotosFromStore, syncPhotoFromStore} from '@/application/syncPhotoRepository';
import {deleteLocalPhotoFile} from '@lib/storage/localStorage';
import {purgeLocalCulledAlbum} from '@lib/culledAlbum/service';
import {hydratePhotos} from '@lib/culledAlbum/photoLoader';
import {
  culledAlbumStore,
  ensureAlbumLoaded,
  getAlbum,
  getPhotoById,
  getPhotosForAlbum,
  persistAlbum,
  removePhotoFromAlbum,
  updateCullingSummary,
  updatePhoto,
} from '@lib/culledAlbum/store';
import {photoKey, photoStateStore} from '@lib/culledAlbum/photoStateStore';
import {toCullingPhoto, isCulledPhotoDisabled, CulledAlbumPhoto} from '@lib/culledAlbum/types';
import {APIResponse} from '@services/api';
import {FileAsset} from '@services/upload/types';
import {NativeModules, Platform} from 'react-native';
import {
  classifyEyeStatus,
  classifyFocus,
  computeKeyFaces,
  computeStats,
  CullingFace,
  CullingPhoto,
  derivePhotoFlags,
  deriveStarRating,
  DuplicateDetectionPhoto,
  assignFaceClustersToSinglePhoto,
} from './cullingUtil';
import {detectDuplicates, detectDuplicatesAsync} from './duplicateDetection';
import {
  clearFaceClusterIndex,
  getFaceClusterIndex,
  seedFaceClusterIndex,
} from './faceClusterIndex';
import {NativeDetectedFace} from '@lib/culledAlbum/types';
import {readImageCaptureTime} from '@lib/media/imageCaptureTime';
import {computeImagePerceptualHash} from '@lib/media/perceptualHash';

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

interface PlatformDetector {
  detectFaces(uri: string, photoId: string): Promise<CullingFace[]>;
}

class NativeDetector implements PlatformDetector {
  async detectFaces(uri: string, photoId: string): Promise<CullingFace[]> {
    if (!NativeLocalStorage?.detectFacesForCulling) {
      throw new Error('Native module not available');
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
    case 'ios':
    case 'android':
    case 'windows':
      return new NativeDetector();
    default:
      return new FallbackDetector();
  }
}

const detector = createPlatformDetector();

function hydrateAnalyzedBatch(albumId: string): CulledAlbumPhoto[] {
  const album = getAlbum(albumId);
  const batchIds = album?.analysisBatchPhotoIds ?? [];
  if (batchIds.length > 0) {
    return hydratePhotos(albumId, batchIds);
  }
  return getPhotosForAlbum(albumId);
}

async function getAnalyzedPhotos(albumId: string): Promise<CullingPhoto[]> {
  await ensureAlbumLoaded(albumId);
  const photos = hydrateAnalyzedBatch(albumId);
  seedFaceClusterIndex(albumId, photos);
  return photos
    .filter(photo => photo.analysisStatus === 'analyzed')
    .map(toCullingPhoto);
}

async function applyDuplicateFlags(albumId: string): Promise<void> {
  const analyzedPhotos = hydrateAnalyzedBatch(albumId).filter(
    entry => entry.analysisStatus === 'analyzed',
  );
  const photoMap: Record<string, DuplicateDetectionPhoto> = {};
  for (const photo of analyzedPhotos) {
    photoMap[photo.photoId] = {
      ...toCullingPhoto(photo),
      capturedAt: photo.capturedAt,
      perceptualHash: photo.perceptualHash,
    };
  }

  await detectDuplicatesAsync(photoMap);

  const syncedPhotoIds: string[] = [];
  photoStateStore.setState(state => {
    for (const photo of Object.values(photoMap)) {
      const entry = state.photoState[photoKey(albumId, photo.photoId)];
      if (!entry) {
        continue;
      }
      entry.duplicated = photo.duplicated;
      if (entry.duplicated) {
        entry.selected = false;
      }
      syncedPhotoIds.push(photo.photoId);
    }
  });

  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (!album) {
      return;
    }

    for (const photo of Object.values(photoMap)) {
      const entry = album.photos.find(item => item.photoId === photo.photoId);
      if (!entry) {
        continue;
      }
      entry.duplicated = photo.duplicated;
      if (entry.duplicated) {
        entry.selected = false;
      }
    }
  });

  if (syncedPhotoIds.length > 0) {
    syncPhotosFromStore(albumId, syncedPhotoIds);
  }
}

function assignFaceClusterIdsIncremental(
  albumId: string,
  photoId: string,
): void {
  const album = getAlbum(albumId);
  if (!album) {
    return;
  }

  const clusterRepresentatives = getFaceClusterIndex(albumId);
  let nextFaceClusterId = album.nextFaceClusterId;

  const updated = updatePhoto(
    albumId,
    photoId,
    photo => {
      if (photo.faces.length === 0) {
        return;
      }
      nextFaceClusterId = assignFaceClustersToSinglePhoto(
        photo.faces,
        clusterRepresentatives,
        nextFaceClusterId,
      );
    },
    {recomputeTotals: false},
  );

  if (!updated) {
    return;
  }

  culledAlbumStore.setState(state => {
    const albumState = state.albums[albumId];
    if (albumState) {
      albumState.nextFaceClusterId = nextFaceClusterId;
    }
  });

  syncPhotoFromStore(albumId, photoId);
}

export const cullingEngine = {
  async analyzePhoto(
    albumId: string,
    photoId: string,
    file: FileAsset,
  ): Promise<APIResponse.CullingPhoto> {
    const existing = getPhotosForAlbum(albumId).find(
      photo => photo.photoId === photoId,
    );
    if (!existing) {
      throw new Error('Photo not found in album store');
    }

    const captureTimePromise =
      existing.capturedAt != null
        ? Promise.resolve(existing.capturedAt)
        : readImageCaptureTime(file.uri);

    const perceptualHashPromise =
      existing.perceptualHash != null
        ? Promise.resolve(existing.perceptualHash)
        : computeImagePerceptualHash(file.uri);

    const [faces, perceptualHash, capturedAt] = await Promise.all([
      detector.detectFaces(file.uri, photoId),
      perceptualHashPromise,
      captureTimePromise,
    ]);
    const flags = derivePhotoFlags(faces);

    const isFirstAnalysis = existing.faces.length === 0;
    const initialStarRating =
      existing.starRating ?? deriveStarRating(faces);

    updatePhoto(albumId, photoId, photo => {
      photo.faces = faces;
      photo.perceptualHash = perceptualHash;
      if (capturedAt != null) {
        photo.capturedAt = capturedAt;
      }
      photo.aiSelected = flags.aiSelected;
      photo.maybe = flags.maybe;
      photo.blurred = flags.blurred;
      photo.closedEyes = flags.closedEyes;
      photo.duplicated = existing.duplicated ?? false;
      photo.starRating = initialStarRating;
      photo.selected = isFirstAnalysis ? flags.selected : existing.selected;
    }, {recomputeTotals: false});

    syncPhotoFromStore(albumId, photoId);

    assignFaceClusterIdsIncremental(albumId, photoId);

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
    const previousSelected = existing.selected;
    const updated = updatePhoto(albumId, photoId, photo => {
      if (data.selected !== undefined) {
        photo.selected = data.selected;
      }
      if (data.starRating !== undefined) {
        photo.starRating = data.starRating;
      }
    }, {immediate: true});
    if (!updated) {
      throw new Error('Photo analysis not found');
    }
    if (
      data.selected !== undefined &&
      data.selected !== previousSelected
    ) {
      culledAlbumStore.setState(state => {
        const entry = state.albums[albumId];
        if (!entry?.cullingStats) {
          return;
        }
        entry.cullingStats = {
          ...entry.cullingStats,
          mySelections: Math.max(
            0,
            entry.cullingStats.mySelections + (data.selected ? 1 : -1),
          ),
        };
      });
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
      await applyDuplicateFlags(albumId);
      updateCullingSummary(albumId);
      await persistAlbum(albumId);
    } else {
      updateCullingSummary(albumId);
      await persistAlbum(albumId);
    }
  },

  async completeAnalysis(albumId: string): Promise<void> {
    const photos = await getAnalyzedPhotos(albumId);
    if (photos.length === 0) {
      throw new Error('No analyzed photos');
    }
    await applyDuplicateFlags(albumId);
    updateCullingSummary(albumId);
    await persistAlbum(albumId);
  },

  async refreshDuplicateFlags(albumId: string): Promise<void> {
    await applyDuplicateFlags(albumId);
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
    clearFaceClusterIndex(albumId);
    await purgeLocalCulledAlbum(albumId);
  },
};

export type {CullingPhoto};
