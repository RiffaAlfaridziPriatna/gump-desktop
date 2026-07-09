import {BKTree} from './bkTree';
import {yieldToMain} from '@lib/async/yieldToMain';
import {
  areFacesSimilar,
  arePerceptualHashesSimilar,
  DuplicateDetectionPhoto,
  PERCEPTUAL_HASH_DUPLICATE_THRESHOLD,
} from './cullingUtil';

const TEMPORAL_WINDOW_MS = 60 * 60 * 1000;
const YIELD_EVERY_N_PHOTOS = 25;

function photoQualityTier(photo: DuplicateDetectionPhoto): number {
  if (photo.blurred) {
    return 0;
  }
  if (photo.closedEyes) {
    return 1;
  }
  return 2;
}

export function detectDuplicates(
  photos: Record<string, DuplicateDetectionPhoto>,
): void {
  runDuplicateDetection(photos);
}

export async function detectDuplicatesAsync(
  photos: Record<string, DuplicateDetectionPhoto>,
): Promise<void> {
  await runDuplicateDetection(photos, true);
}

async function runDuplicateDetection(
  photos: Record<string, DuplicateDetectionPhoto>,
  yieldBetweenChunks = false,
): Promise<void> {
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
    photoIdToRecord.set(record.photoId, record);
  }

  const duplicateGroups: Set<string>[] = [];
  const photoIdToGroupIndex = new Map<string, number>();

  const processed: DuplicateDetectionPhoto[] = [];
  let windowStart = 0;

  for (let i = 0; i < sorted.length; i++) {
    const photoA = sorted[i]!;
    const aTime = photoA.capturedAt ?? 0;

    while (windowStart < processed.length) {
      const candidate = processed[windowStart]!;
      const candidateTime = candidate.capturedAt ?? 0;
      if (aTime - candidateTime <= TEMPORAL_WINDOW_MS) {
        break;
      }
      windowStart++;
    }

    const candidateIds = new Set<string>();

    if (photoA.perceptualHash) {
      const hashCandidates = tree.findWithinDistance(
        photoA.perceptualHash,
        PERCEPTUAL_HASH_DUPLICATE_THRESHOLD,
      );
      for (const candidateId of hashCandidates) {
        if (candidateId !== photoA.photoId) {
          candidateIds.add(candidateId);
        }
      }
    }

    for (let p = windowStart; p < processed.length; p++) {
      candidateIds.add(processed[p]!.photoId);
    }

    for (const candidateId of candidateIds) {
      const photoB = photoIdToRecord.get(candidateId);
      if (!photoB || photoB.photoId === photoA.photoId) {
        continue;
      }

      const hasSimilarHash = arePerceptualHashesSimilar(
        photoA.perceptualHash,
        photoB.perceptualHash,
      );
      const hasSimilarFaces = areFacesSimilar(photoA.faces, photoB.faces);

      if (!hasSimilarHash && !hasSimilarFaces) {
        continue;
      }

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

    if (photoA.perceptualHash) {
      tree.insert(photoA.perceptualHash, photoA.photoId);
    }
    processed.push(photoA);

    if (yieldBetweenChunks && i > 0 && i % YIELD_EVERY_N_PHOTOS === 0) {
      await yieldToMain();
    }
  }

  for (let groupIndex = 0; groupIndex < duplicateGroups.length; groupIndex++) {
    const group = duplicateGroups[groupIndex]!;
    if (group.size <= 1) {
      continue;
    }

    const groupPhotos = Array.from(group)
      .map(id => photoIdToRecord.get(id)!)
      .filter(Boolean);

    const bestPhoto = groupPhotos.reduce((best, current) => {
      const bestTier = photoQualityTier(best);
      const currentTier = photoQualityTier(current);
      if (currentTier !== bestTier) {
        return currentTier > bestTier ? current : best;
      }
      return (current.starRating ?? 0) > (best.starRating ?? 0) ? current : best;
    });

    for (const photo of groupPhotos) {
      photo.duplicated = photo.photoId !== bestPhoto.photoId;
    }

    if (
      yieldBetweenChunks &&
      groupIndex > 0 &&
      groupIndex % YIELD_EVERY_N_PHOTOS === 0
    ) {
      await yieldToMain();
    }
  }
}
