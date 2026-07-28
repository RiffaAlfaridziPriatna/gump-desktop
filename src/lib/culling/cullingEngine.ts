import {
  clearSyncPhotoFromStore,
  syncPhotoFromStore,
  syncPhotosFromStore,
} from '@/application/syncPhotoRepository';
import { hydratePhotos } from '@lib/culledAlbum/photoLoader';
import { photoKey, photoStateStore } from '@lib/culledAlbum/photoStateStore';
import { purgeLocalCulledAlbum } from '@lib/culledAlbum/service';
import { removePersistedPhoto } from '@lib/culledAlbum/storage';
import {
  culledAlbumStore,
  ensureAlbumLoaded,
  flushPendingPhotoUpdates,
  getAlbum,
  getPhotoById,
  getPhotosForAlbum,
  persistAlbum,
  removePhotoFromAlbum,
  updateCullingSummary,
  updatePhoto,
} from '@lib/culledAlbum/store';
import { CulledAlbumPhoto, isCulledPhotoDisabled, NativeDetectedFace, toCullingPhoto } from '@lib/culledAlbum/types';
import { readImageCaptureTime } from '@lib/media/imageCaptureTime';
import { computeImagePerceptualHash } from '@lib/media/perceptualHash';
import {
  analyzePhotoForCulling,
  deleteLocalPhotoFile,
  detectFacesForCulling,
  hasNativeDetectFacesForCulling,
} from '@lib/storage/localStorage';
import { APIResponse } from '@services/api';
import { FileAsset } from '@services/upload/types';
import { Platform } from 'react-native';
import { currentAnalysisEngineVersion } from './analysisEngine';
import {
  backfillMissingAnalyzedPhotoAssets,
  clearScheduledAnalyzedPhotoAssets,
  ensureAnalyzedPhotoAssetsForPhoto,
  scheduleAnalyzedPhotoAssetsForPhoto,
} from './analyzedPhotoAssets';
import {
  assignFaceClustersToSinglePhoto,
  classifyEyeStatus,
  classifyFocus,
  computeKeyFaces,
  computeStats,
  CullingFace,
  CullingPhoto,
  derivePhotoFlags,
  deriveStarRating,
  DuplicateDetectionPhoto,
} from './cullingUtil';
import { detectDuplicatesAsync } from './duplicateDetection';
import {
  addStatsDelta,
  combineStatsDelta,
  patchDuplicateGroupsAfterDelete,
  patchKeyFacesAfterDelete,
  statsContributionFromPhoto,
  subtractStatsDelta,
  syncKeyFaceCropUrisFromPhotos,
} from './deletePhotoDerivedState';
import {
  clearFaceClusterIndex,
  getFaceClusterIndex,
  seedFaceClusterIndex,
} from './faceClusterIndex';
import { rejectLikelyNonFaceArtifacts, rejectLikelyDisplayedMediaFaces, suppressSpatiallyRedundantFaces } from './faceSpatialDedupe';

type AnalyzedNativePhoto = {
  faces: CullingFace[];
  perceptualHash: string | null;
  capturedAt: number | null;
};

function mapNativeFace(
  face: NativeDetectedFace,
  photoId: string,
  index: number,
): CullingFace {
  const sharpness = face.sharpness ?? 0;

  return {
    boundingBox: face.boundingBox,
    eyeStatus: classifyEyeStatus(face.eyesOpen, face.pose),
    eyeConfidence: face.eyesOpen?.confidence ?? 0,
    focusLevel: classifyFocus(sharpness),
    sharpness,
    brightness: face.brightness ?? 0,
    landmarks: face.landmarks ?? [],
    pose: face.pose ?? {pitch: 0, roll: 0, yaw: 0},
    rekognitionFaceId: `${photoId}-${index}`,
  };
}

interface PlatformDetector {
  detectFaces(uri: string, photoId: string): Promise<CullingFace[]>;
  analyzePhoto(uri: string, photoId: string): Promise<AnalyzedNativePhoto>;
}

function normalizePerceptualHash(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[0-9a-f]{16}$/i.test(value)) {
    return null;
  }
  return value.toLowerCase();
}

function normalizeCapturedAt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function mapDetectedFaces(
  faces: NativeDetectedFace[],
  photoId: string,
): CullingFace[] {
  const mapped = faces.map((face, index) => mapNativeFace(face, photoId, index));
  return suppressSpatiallyRedundantFaces(
    rejectLikelyDisplayedMediaFaces(rejectLikelyNonFaceArtifacts(mapped)),
  );
}

class NativeDetector implements PlatformDetector {
  async detectFaces(uri: string, photoId: string): Promise<CullingFace[]> {
    if (!hasNativeDetectFacesForCulling()) {
      throw new Error('Native module not available');
    }
    const faces = await detectFacesForCulling(uri);
    return mapDetectedFaces(faces, photoId);
  }

  async analyzePhoto(
    uri: string,
    photoId: string,
  ): Promise<AnalyzedNativePhoto> {
    const unified = await analyzePhotoForCulling(uri);
    if (unified) {
      return {
        faces: mapDetectedFaces(unified.faces ?? [], photoId),
        perceptualHash: normalizePerceptualHash(unified.perceptualHash),
        capturedAt: normalizeCapturedAt(unified.capturedAt),
      };
    }

    const [faces, perceptualHash, capturedAt] = await Promise.all([
      this.detectFaces(uri, photoId),
      computeImagePerceptualHash(uri),
      readImageCaptureTime(uri),
    ]);
    return {faces, perceptualHash, capturedAt};
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

  async analyzePhoto(
    uri: string,
    photoId: string,
  ): Promise<AnalyzedNativePhoto> {
    const [faces, perceptualHash, capturedAt] = await Promise.all([
      this.detectFaces(uri, photoId),
      computeImagePerceptualHash(uri),
      readImageCaptureTime(uri),
    ]);
    return {faces, perceptualHash, capturedAt};
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

  const groups = await detectDuplicatesAsync(photoMap);

  const syncedPhotoIds: string[] = [];
  photoStateStore.setState(state => {
    for (const photo of Object.values(photoMap)) {
      const entry = state.photoState[photoKey(albumId, photo.photoId)];
      if (!entry) {
        continue;
      }
      const nextSelected = photo.duplicated ? false : entry.selected;
      if (
        entry.duplicated === photo.duplicated &&
        entry.selected === nextSelected
      ) {
        continue;
      }
      entry.duplicated = photo.duplicated;
      entry.selected = nextSelected;
      syncedPhotoIds.push(photo.photoId);
    }
  });

  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (!album) {
      return;
    }

    album.cullingDuplicateGroups = groups;

    for (const photo of Object.values(photoMap)) {
      const entry = album.photos.find(item => item.photoId === photo.photoId);
      if (!entry) {
        continue;
      }
      const nextSelected = photo.duplicated ? false : entry.selected;
      if (
        entry.duplicated === photo.duplicated &&
        entry.selected === nextSelected
      ) {
        continue;
      }
      entry.duplicated = photo.duplicated;
      entry.selected = nextSelected;
    }
  });

  if (syncedPhotoIds.length > 0) {
    syncPhotosFromStore(albumId, syncedPhotoIds);
  }
}

function applyDuplicatedFlagChanges(
  albumId: string,
  changes: Array<{photoId: string; duplicated: boolean}>,
): void {
  if (changes.length === 0) {
    return;
  }

  const syncedPhotoIds: string[] = [];
  for (const change of changes) {
    updatePhoto(
      albumId,
      change.photoId,
      photo => {
        photo.duplicated = change.duplicated;
        if (change.duplicated) {
          photo.selected = false;
        }
      },
      {recomputeTotals: false, immediate: true},
    );
    syncedPhotoIds.push(change.photoId);
  }

  if (syncedPhotoIds.length > 0) {
    syncPhotosFromStore(albumId, syncedPhotoIds);
  }
}

async function backfillSuccessorKeyFaceCrops(
  albumId: string,
  successorPhotoIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(successorPhotoIds)];
  for (const photoId of uniqueIds) {
    const photo = getPhotoById(albumId, photoId);
    if (!photo) {
      continue;
    }
    await ensureAnalyzedPhotoAssetsForPhoto(albumId, photoId, photo.file);
  }

  culledAlbumStore.setState(state => {
    const album = state.albums[albumId];
    if (!album?.cullingKeyFaces) {
      return;
    }
    album.cullingKeyFaces = syncKeyFaceCropUrisFromPhotos(
      album.cullingKeyFaces,
      id => getPhotoById(albumId, id),
    );
  });
  await persistAlbum(albumId);
}

function reconcileFaceClusterIdsForAlbum(albumId: string): void {
  clearFaceClusterIndex(albumId);
  const clusterRepresentatives = getFaceClusterIndex(albumId);
  let nextFaceClusterId = 0;
  const syncedPhotoIds: string[] = [];

  for (const photo of getPhotosForAlbum(albumId)) {
    if (photo.analysisStatus !== 'analyzed' || photo.faces.length === 0) {
      continue;
    }

    updatePhoto(
      albumId,
      photo.photoId,
      entry => {
        nextFaceClusterId = assignFaceClustersToSinglePhoto(
          entry.faces,
          clusterRepresentatives,
          nextFaceClusterId,
        );
      },
      {recomputeTotals: false, immediate: true},
    );
    syncedPhotoIds.push(photo.photoId);
  }

  culledAlbumStore.setState(state => {
    const albumState = state.albums[albumId];
    if (albumState) {
      albumState.nextFaceClusterId = nextFaceClusterId;
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
    {recomputeTotals: false, immediate: true},
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

    const analyzed = await detector.analyzePhoto(file.uri, photoId);
    const faces = analyzed.faces;
    const perceptualHash = existing.perceptualHash ?? analyzed.perceptualHash;
    const capturedAt = existing.capturedAt ?? analyzed.capturedAt;

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
      photo.analysisEngineVersion = currentAnalysisEngineVersion();
      photo.aiSelected = flags.aiSelected;
      photo.maybe = flags.maybe;
      photo.blurred = flags.blurred;
      photo.closedEyes = flags.closedEyes;
      photo.duplicated = existing.duplicated ?? false;
      photo.starRating = initialStarRating;
      photo.selected = isFirstAnalysis ? flags.selected : existing.selected;
    }, {recomputeTotals: false, immediate: true});

    syncPhotoFromStore(albumId, photoId);

    assignFaceClusterIdsIncremental(albumId, photoId);

    scheduleAnalyzedPhotoAssetsForPhoto(albumId, photoId, file);

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
      throw new Error('Cannot modify photos after upload');
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
      throw new Error('Cannot delete photos after upload');
    }

    const deletedContribution = statsContributionFromPhoto(photo);
    const groupsBefore = album?.cullingDuplicateGroups ?? [];
    const keyFacesBefore = album?.cullingKeyFaces ?? [];
    const statsBefore = album?.cullingStats;

    const groupPatch = patchDuplicateGroupsAfterDelete(
      groupsBefore,
      photoId,
      id => getPhotoById(albumId, id),
    );

    clearSyncPhotoFromStore(albumId, photoId);
    removePhotoFromAlbum(albumId, photoId);
    applyDuplicatedFlagChanges(albumId, groupPatch.flagChanges);

    const keyFacePatch = patchKeyFacesAfterDelete(
      keyFacesBefore,
      photoId,
      id => getPhotoById(albumId, id),
    );

    const statsDelta = combineStatsDelta(
      subtractStatsDelta(
        {
          totalPhotos: 0,
          mySelections: 0,
          aiSelected: 0,
          maybe: 0,
          blurred: 0,
          closedEyes: 0,
          duplicated: 0,
        },
        deletedContribution,
      ),
      groupPatch.statsDelta,
    );

    culledAlbumStore.setState(state => {
      const entry = state.albums[albumId];
      if (!entry) {
        return;
      }
      entry.cullingDuplicateGroups = groupPatch.groups;
      entry.cullingKeyFaces = keyFacePatch.keyFaces;
      if (statsBefore) {
        entry.cullingStats = addStatsDelta(statsBefore, statsDelta);
      } else {
        const analyzed = getPhotosForAlbum(albumId)
          .filter(item => item.analysisStatus === 'analyzed')
          .map(toCullingPhoto);
        entry.cullingStats =
          analyzed.length > 0 ? computeStats(analyzed) : undefined;
      }
    });

    await removePersistedPhoto(albumId, photoId);
    try {
      await deleteLocalPhotoFile(photo.file.uri);
    } catch (error) {}

    await persistAlbum(albumId);

    if (keyFacePatch.successorPhotoIds.length > 0) {
      void backfillSuccessorKeyFaceCrops(
        albumId,
        keyFacePatch.successorPhotoIds,
      );
    }
  },

  async completeAnalysis(albumId: string): Promise<void> {
    const albumPhotos = getPhotosForAlbum(albumId);
    const analyzedPhotos = albumPhotos
      .filter(photo => photo.analysisStatus === 'analyzed')
      .map(toCullingPhoto);
    if (analyzedPhotos.length === 0) {
      throw new Error('No analyzed photos');
    }

    reconcileFaceClusterIdsForAlbum(albumId);
    await backfillMissingAnalyzedPhotoAssets(albumId, albumPhotos, {
      regenerateFaceCrops: false,
    });
    flushPendingPhotoUpdates();
    await applyDuplicateFlags(albumId);
    updateCullingSummary(albumId);
    await persistAlbum(albumId);
  },

  async refreshDuplicateFlags(albumId: string): Promise<void> {
    await applyDuplicateFlags(albumId);
  },

  async refreshAssets(albumId: string): Promise<void> {
    const albumPhotos = getPhotosForAlbum(albumId);
    await backfillMissingAnalyzedPhotoAssets(albumId, albumPhotos, {
      regenerateFaceCrops: false,
    });
    flushPendingPhotoUpdates();
    updateCullingSummary(albumId);
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
    clearScheduledAnalyzedPhotoAssets(albumId);
    clearFaceClusterIndex(albumId);
    await purgeLocalCulledAlbum(albumId);
  },
};

export type { CullingPhoto };

