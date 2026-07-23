import {
  CulledAlbumPhoto,
  CullingDuplicateGroup,
} from '@lib/culledAlbum/types';
import {APIResponse} from '@services/api';
import {
  isDuplicateKeeperPhoto,
  pickDuplicateGroupBestPhoto,
} from './duplicateDetection';
import {
  CullFilterKey,
  matchesCullFilterKey,
  parseKeyFaceVariantId,
} from './cullingUtil';

type StatsPhoto = Pick<
  CulledAlbumPhoto,
  | 'selected'
  | 'aiSelected'
  | 'maybe'
  | 'blurred'
  | 'closedEyes'
  | 'duplicated'
  | 'starRating'
  | 'photoId'
  | 'faces'
>;

function matchesStatKey(photo: StatsPhoto, key: CullFilterKey): boolean {
  return matchesCullFilterKey(
    {
      photoId: photo.photoId,
      selected: photo.selected,
      aiSelected: photo.aiSelected,
      maybe: photo.maybe,
      blurred: photo.blurred,
      closedEyes: photo.closedEyes,
      duplicated: photo.duplicated,
      starRating: photo.starRating,
      faces: photo.faces as any,
    } as any,
    key,
  );
}

export type CullStatsDelta = {
  totalPhotos: number;
  mySelections: number;
  aiSelected: number;
  maybe: number;
  blurred: number;
  closedEyes: number;
  duplicated: number;
};

export function emptyStatsDelta(): CullStatsDelta {
  return {
    totalPhotos: 0,
    mySelections: 0,
    aiSelected: 0,
    maybe: 0,
    blurred: 0,
    closedEyes: 0,
    duplicated: 0,
  };
}

export function statsContributionFromPhoto(photo: StatsPhoto): CullStatsDelta {
  return {
    totalPhotos: 1,
    mySelections: photo.selected ? 1 : 0,
    aiSelected: matchesStatKey(photo, 'aiSelected') ? 1 : 0,
    maybe: matchesStatKey(photo, 'maybe') ? 1 : 0,
    blurred: matchesStatKey(photo, 'blurred') ? 1 : 0,
    closedEyes: matchesStatKey(photo, 'closedEyes') ? 1 : 0,
    duplicated: photo.duplicated ? 1 : 0,
  };
}

export function addStatsDelta(
  base: APIResponse.CullingStats,
  delta: CullStatsDelta,
): APIResponse.CullingStats {
  const clamp = (value: number) => Math.max(0, value);
  return {
    totalPhotos: clamp(base.totalPhotos + delta.totalPhotos),
    mySelections: clamp(base.mySelections + delta.mySelections),
    aiSelected: clamp(base.aiSelected + delta.aiSelected),
    maybe: clamp(base.maybe + delta.maybe),
    blurred: clamp(base.blurred + delta.blurred),
    closedEyes: clamp(base.closedEyes + delta.closedEyes),
    duplicated: clamp(base.duplicated + delta.duplicated),
  };
}

export function subtractStatsDelta(
  left: CullStatsDelta,
  right: CullStatsDelta,
): CullStatsDelta {
  return {
    totalPhotos: left.totalPhotos - right.totalPhotos,
    mySelections: left.mySelections - right.mySelections,
    aiSelected: left.aiSelected - right.aiSelected,
    maybe: left.maybe - right.maybe,
    blurred: left.blurred - right.blurred,
    closedEyes: left.closedEyes - right.closedEyes,
    duplicated: left.duplicated - right.duplicated,
  };
}

export function combineStatsDelta(
  ...deltas: CullStatsDelta[]
): CullStatsDelta {
  return deltas.reduce(
    (acc, delta) => ({
      totalPhotos: acc.totalPhotos + delta.totalPhotos,
      mySelections: acc.mySelections + delta.mySelections,
      aiSelected: acc.aiSelected + delta.aiSelected,
      maybe: acc.maybe + delta.maybe,
      blurred: acc.blurred + delta.blurred,
      closedEyes: acc.closedEyes + delta.closedEyes,
      duplicated: acc.duplicated + delta.duplicated,
    }),
    emptyStatsDelta(),
  );
}

export type DuplicateFlagChange = {
  photoId: string;
  duplicated: boolean;
};

export type DuplicateGroupPatchResult = {
  groups: CullingDuplicateGroup[];
  flagChanges: DuplicateFlagChange[];
  statsDelta: CullStatsDelta;
};

export function patchDuplicateGroupsAfterDelete(
  groups: CullingDuplicateGroup[],
  deletedPhotoId: string,
  getPhoto: (photoId: string) => StatsPhoto | undefined,
): DuplicateGroupPatchResult {
  const flagChanges: DuplicateFlagChange[] = [];
  let statsDelta = emptyStatsDelta();
  const nextGroups: CullingDuplicateGroup[] = [];

  for (const group of groups) {
    if (!group.photoIds.includes(deletedPhotoId)) {
      nextGroups.push(group);
      continue;
    }

    const remainingIds = group.photoIds.filter(id => id !== deletedPhotoId);
    if (remainingIds.length <= 1) {
      for (const photoId of remainingIds) {
        const photo = getPhoto(photoId);
        if (!photo) {
          continue;
        }
        if (photo.duplicated) {
          const before = statsContributionFromPhoto(photo);
          const after = statsContributionFromPhoto({
            ...photo,
            duplicated: false,
          });
          statsDelta = combineStatsDelta(
            statsDelta,
            subtractStatsDelta(after, before),
          );
          flagChanges.push({photoId, duplicated: false});
        }
      }
      continue;
    }

    const remainingPhotos = remainingIds
      .map(photoId => getPhoto(photoId))
      .filter((photo): photo is StatsPhoto => Boolean(photo));

    if (remainingPhotos.length === 0) {
      continue;
    }

    const keepers = remainingPhotos.filter(isDuplicateKeeperPhoto);
    if (keepers.length === 0) {
      for (const photo of remainingPhotos) {
        if (!photo.duplicated) {
          continue;
        }
        const before = statsContributionFromPhoto(photo);
        const after = statsContributionFromPhoto({
          ...photo,
          duplicated: false,
        });
        statsDelta = combineStatsDelta(
          statsDelta,
          subtractStatsDelta(after, before),
        );
        flagChanges.push({photoId: photo.photoId, duplicated: false});
      }
      continue;
    }

    const bestPhoto = pickDuplicateGroupBestPhoto(keepers);
    for (const photo of remainingPhotos) {
      const nextDuplicated = photo.photoId !== bestPhoto.photoId;
      if (photo.duplicated === nextDuplicated) {
        continue;
      }
      const before = statsContributionFromPhoto(photo);
      const after = statsContributionFromPhoto({
        ...photo,
        duplicated: nextDuplicated,
      });
      statsDelta = combineStatsDelta(
        statsDelta,
        subtractStatsDelta(after, before),
      );
      flagChanges.push({photoId: photo.photoId, duplicated: nextDuplicated});
    }

    nextGroups.push({
      groupId: group.groupId,
      photoIds: remainingIds,
      bestPhotoId: bestPhoto.photoId,
    });
  }

  return {groups: nextGroups, flagChanges, statsDelta};
}

export type KeyFacePatchResult = {
  keyFaces: APIResponse.CullingKeyFace[];
  successorPhotoIds: string[];
};

export function patchKeyFacesAfterDelete(
  keyFaces: APIResponse.CullingKeyFace[],
  deletedPhotoId: string,
  getPhoto: (photoId: string) => CulledAlbumPhoto | undefined,
): KeyFacePatchResult {
  const successorPhotoIds: string[] = [];
  const nextKeyFaces: APIResponse.CullingKeyFace[] = [];

  for (const entry of keyFaces) {
    if (!entry.photoIds.includes(deletedPhotoId)) {
      nextKeyFaces.push(entry);
      continue;
    }

    const photoIds = entry.photoIds.filter(id => id !== deletedPhotoId);
    if (photoIds.length === 0) {
      continue;
    }

    const occurrenceCount = Math.max(1, (entry.occurrenceCount ?? 1) - 1);
    if (entry.sourcePhotoId !== deletedPhotoId) {
      nextKeyFaces.push({
        ...entry,
        photoIds,
        occurrenceCount,
      });
      continue;
    }

    const successorPhotoId = photoIds[0]!;
    const successor = getPhoto(successorPhotoId);
    const rebound = rebindKeyFaceSource(entry, successorPhotoId, successor);
    successorPhotoIds.push(successorPhotoId);
    nextKeyFaces.push({
      ...rebound,
      photoIds,
      occurrenceCount,
    });
  }

  return {keyFaces: nextKeyFaces, successorPhotoIds};
}

function rebindKeyFaceSource(
  entry: APIResponse.CullingKeyFace,
  successorPhotoId: string,
  successor: CulledAlbumPhoto | undefined,
): APIResponse.CullingKeyFace {
  if (!successor) {
    return {
      ...entry,
      sourcePhotoId: successorPhotoId,
      sourceFaceIndex: undefined,
      boundingBox: undefined,
      cropUri: undefined,
    };
  }

  const parsed = parseKeyFaceVariantId(entry.faceId);
  let faceIndex = -1;
  if (parsed) {
    faceIndex = successor.faces.findIndex(
      face =>
        face.rekognitionFaceId === parsed.clusterId &&
        face.eyeStatus === parsed.eyeStatus &&
        face.focusLevel === parsed.focusLevel,
    );
    if (faceIndex < 0) {
      faceIndex = successor.faces.findIndex(
        face => face.rekognitionFaceId === parsed.clusterId,
      );
    }
  }
  if (faceIndex < 0 && typeof entry.sourceFaceIndex === 'number') {
    faceIndex =
      entry.sourceFaceIndex < successor.faces.length
        ? entry.sourceFaceIndex
        : 0;
  }
  if (faceIndex < 0 && successor.faces.length > 0) {
    faceIndex = 0;
  }

  const face = faceIndex >= 0 ? successor.faces[faceIndex] : undefined;
  return {
    ...entry,
    sourcePhotoId: successorPhotoId,
    sourceFaceIndex: faceIndex >= 0 ? faceIndex : undefined,
    boundingBox: face?.boundingBox,
    cropUri: face?.cropUri,
    eyeStatus: face?.eyeStatus ?? entry.eyeStatus,
    focusLevel: face?.focusLevel ?? entry.focusLevel,
  };
}

export function syncKeyFaceCropUrisFromPhotos(
  keyFaces: APIResponse.CullingKeyFace[],
  getPhoto: (photoId: string) => CulledAlbumPhoto | undefined,
): APIResponse.CullingKeyFace[] {
  return keyFaces.map(entry => {
    if (entry.cropUri || !entry.sourcePhotoId) {
      return entry;
    }
    const photo = getPhoto(entry.sourcePhotoId);
    if (!photo) {
      return entry;
    }
    const faceIndex = entry.sourceFaceIndex ?? 0;
    const face = photo.faces[faceIndex];
    if (!face?.cropUri) {
      return entry;
    }
    return {
      ...entry,
      cropUri: face.cropUri,
      boundingBox: face.boundingBox ?? entry.boundingBox,
    };
  });
}
