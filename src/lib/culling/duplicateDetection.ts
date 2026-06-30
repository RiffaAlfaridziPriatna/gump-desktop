import {BKTree} from './bkTree';
import {
  areFacesSimilar,
  arePerceptualHashesSimilar,
  DuplicateDetectionPhoto,
  PERCEPTUAL_HASH_DUPLICATE_THRESHOLD,
} from './cullingUtil';

const TEMPORAL_WINDOW_MS = 60 * 60 * 1000;

export function detectDuplicatesOptimized(
  photos: Record<string, DuplicateDetectionPhoto>,
): void {
  const records = Object.values(photos);

  for (const record of records) {
    record.duplicated = false;
  }

  if (records.length < 2) {
    return;
  }

  const sorted = records.sort((a, b) => {
    const timeA = a.capturedAt ?? 0;
    const timeB = b.capturedAt ?? 0;
    return timeA - timeB;
  });

  const tree = new BKTree();
  const photoIdToRecord = new Map<string, DuplicateDetectionPhoto>();

  for (const record of sorted) {
    if (record.perceptualHash) {
      tree.insert(record.perceptualHash, record.photoId);
    }
    photoIdToRecord.set(record.photoId, record);
  }

  const duplicateGroups: Set<string>[] = [];
  const photoIdToGroupIndex = new Map<string, number>();
  const checkedPairs = new Set<string>();

  for (let i = 0; i < sorted.length; i++) {
    const photoA = sorted[i]!;
    const aTime = photoA.capturedAt ?? 0;

    const hashCandidates = photoA.perceptualHash
      ? tree.findWithinDistance(
          photoA.perceptualHash,
          PERCEPTUAL_HASH_DUPLICATE_THRESHOLD,
        )
      : [];

    const candidateSet = new Set<DuplicateDetectionPhoto>();

    for (const candidateId of hashCandidates) {
      if (candidateId === photoA.photoId) {
        continue;
      }
      const candidate = photoIdToRecord.get(candidateId);
      if (candidate) {
        candidateSet.add(candidate);
      }
    }

    for (let j = i + 1; j < sorted.length; j++) {
      const photoB = sorted[j]!;
      const bTime = photoB.capturedAt ?? 0;

      if (Math.abs(bTime - aTime) > TEMPORAL_WINDOW_MS) {
        break;
      }

      candidateSet.add(photoB);
    }

    for (const photoB of candidateSet) {
      const pairKey =
        photoA.photoId < photoB.photoId
          ? `${photoA.photoId}:${photoB.photoId}`
          : `${photoB.photoId}:${photoA.photoId}`;

      if (checkedPairs.has(pairKey)) {
        continue;
      }

      checkedPairs.add(pairKey);

      const hasSimilarHash = arePerceptualHashesSimilar(
        photoA.perceptualHash,
        photoB.perceptualHash,
      );
      const hasSimilarFaces = areFacesSimilar(photoA.faces, photoB.faces);

      if (hasSimilarHash || hasSimilarFaces) {
        const groupIndexA = photoIdToGroupIndex.get(photoA.photoId);
        const groupIndexB = photoIdToGroupIndex.get(photoB.photoId);

        if (groupIndexA !== undefined && groupIndexB !== undefined) {
          if (groupIndexA !== groupIndexB) {
            const groupA = duplicateGroups[groupIndexA]!;
            const groupB = duplicateGroups[groupIndexB]!;
            for (const id of groupB) {
              groupA.add(id);
              photoIdToGroupIndex.set(id, groupIndexA);
            }
            groupB.clear();
          }
        } else if (groupIndexA !== undefined) {
          duplicateGroups[groupIndexA]!.add(photoB.photoId);
          photoIdToGroupIndex.set(photoB.photoId, groupIndexA);
        } else if (groupIndexB !== undefined) {
          duplicateGroups[groupIndexB]!.add(photoA.photoId);
          photoIdToGroupIndex.set(photoA.photoId, groupIndexB);
        } else {
          const newGroup = new Set([photoA.photoId, photoB.photoId]);
          const newIndex = duplicateGroups.length;
          duplicateGroups.push(newGroup);
          photoIdToGroupIndex.set(photoA.photoId, newIndex);
          photoIdToGroupIndex.set(photoB.photoId, newIndex);
        }
      }
    }
  }

  for (const group of duplicateGroups) {
    if (group.size <= 1) {
      continue;
    }

    const groupPhotos = Array.from(group)
      .map(id => photoIdToRecord.get(id)!)
      .filter(Boolean);

    const bestPhoto = groupPhotos.reduce((best, current) => {
      const bestRating = best.starRating ?? 0;
      const currentRating = current.starRating ?? 0;
      return currentRating > bestRating ? current : best;
    });

    for (const photo of groupPhotos) {
      photo.duplicated = photo.photoId !== bestPhoto.photoId;
    }
  }
}
