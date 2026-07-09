import {CulledPhoto} from '../entities/CulledPhoto';

export class DuplicateDetectionService {
  private readonly hammingThreshold: number;

  constructor(hammingThreshold: number = 8) {
    this.hammingThreshold = hammingThreshold;
  }

  detectDuplicates(photos: CulledPhoto[]): Set<string> {
    const duplicateIds = new Set<string>();
    const analyzedPhotos = photos.filter(p => p.analysisStatus === 'analyzed' && p.perceptualHash);

    if (analyzedPhotos.length < 2) {
      return duplicateIds;
    }

    for (let i = 0; i < analyzedPhotos.length; i++) {
      const photoA = analyzedPhotos[i]!;
      if (duplicateIds.has(photoA.photoId)) continue;

      for (let j = i + 1; j < analyzedPhotos.length; j++) {
        const photoB = analyzedPhotos[j]!;
        if (duplicateIds.has(photoB.photoId)) continue;

        if (this.areDuplicates(photoA, photoB)) {
          const keepPhoto = this.selectPhotoToKeep(photoA, photoB);
          const duplicatePhoto = keepPhoto === photoA ? photoB : photoA;
          duplicateIds.add(duplicatePhoto.photoId);
        }
      }
    }

    return duplicateIds;
  }

  areDuplicates(photoA: CulledPhoto, photoB: CulledPhoto): boolean {
    if (!photoA.perceptualHash || !photoB.perceptualHash) {
      return false;
    }

    const distance = this.hammingDistance(photoA.perceptualHash, photoB.perceptualHash);
    if (distance > this.hammingThreshold) {
      return false;
    }

    const timeDiffMs = Math.abs(
      (photoA.capturedAt ?? photoA.uploadedAt) - (photoB.capturedAt ?? photoB.uploadedAt)
    );
    const temporalThresholdMs = 5000;

    return timeDiffMs < temporalThresholdMs;
  }

  private hammingDistance(hashA: string, hashB: string): number {
    if (hashA.length !== hashB.length) {
      return Number.MAX_SAFE_INTEGER;
    }

    let distance = 0;
    for (let i = 0; i < hashA.length; i++) {
      const charA = hashA.charAt(i);
      const charB = hashB.charAt(i);
      if (charA !== charB) {
        const nibbleA = parseInt(charA, 16);
        const nibbleB = parseInt(charB, 16);
        distance += this.popCount(nibbleA ^ nibbleB);
      }
    }
    return distance;
  }

  private popCount(n: number): number {
    let count = 0;
    while (n > 0) {
      count += n & 1;
      n >>= 1;
    }
    return count;
  }

  private selectPhotoToKeep(photoA: CulledPhoto, photoB: CulledPhoto): CulledPhoto {
    const sizeA = photoA.file.size;
    const sizeB = photoB.file.size;

    if (sizeA !== sizeB) {
      return sizeA > sizeB ? photoA : photoB;
    }

    const timeA = photoA.capturedAt ?? photoA.uploadedAt;
    const timeB = photoB.capturedAt ?? photoB.uploadedAt;

    return timeA < timeB ? photoA : photoB;
  }
}
