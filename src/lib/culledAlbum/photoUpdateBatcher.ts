import {shouldDeferHeavyWorkForNavigation} from '@lib/navigation/uploadAwareNavigation';
import {Platform} from 'react-native';
import type {
  AnalysisCountKey,
  CulledAlbumPhoto,
  LocalImportCountKey,
} from './types';

export type PhotoUpdateOptions = {
  recomputeTotals?: boolean;
  storageDelta?: number;
  batchCountShift?: {
    from: LocalImportCountKey;
    to: LocalImportCountKey;
  };
  analysisCountShift?: {
    from: AnalysisCountKey;
    to: AnalysisCountKey;
  };
  immediate?: boolean;
};

export type PendingPhotoUpdate = {
  albumId: string;
  photoId: string;
  updater: (photo: CulledAlbumPhoto) => void;
  options?: PhotoUpdateOptions;
};

const MIN_FLUSH_INTERVAL_MS = Platform.OS === 'windows' ? 250 : 120;
const DEFERRED_FLUSH_MS = Platform.OS === 'windows' ? 80 : 50;
export const PHOTO_UPDATE_APPLY_CHUNK = 20;

function pendingPhotoKey(update: PendingPhotoUpdate): string {
  return `${update.albumId}:${update.photoId}`;
}

let pending: PendingPhotoUpdate[] = [];
const pendingByPhoto = new Map<string, PendingPhotoUpdate>();
let flushScheduled = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lastFlushAt = 0;
let batchApplier: ((updates: PendingPhotoUpdate[]) => void) | null = null;

export function registerPhotoUpdateBatchApplier(
  applier: (updates: PendingPhotoUpdate[]) => void,
): void {
  batchApplier = applier;
}

export function flushScheduledPhotoUpdates(): void {
  if (!batchApplier) {
    return;
  }
  flushPendingPhotoUpdates(batchApplier);
}

function composeCountShift<T extends string>(
  left?: {from: T; to: T},
  right?: {from: T; to: T},
): {from: T; to: T} | undefined {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }

  return {from: left.from, to: right.to};
}

function composeBatchCountShift(
  left?: PhotoUpdateOptions['batchCountShift'],
  right?: PhotoUpdateOptions['batchCountShift'],
): PhotoUpdateOptions['batchCountShift'] {
  return composeCountShift(left, right);
}

function composeAnalysisCountShift(
  left?: PhotoUpdateOptions['analysisCountShift'],
  right?: PhotoUpdateOptions['analysisCountShift'],
): PhotoUpdateOptions['analysisCountShift'] {
  return composeCountShift(left, right);
}

function mergeOptions(
  left?: PhotoUpdateOptions,
  right?: PhotoUpdateOptions,
): PhotoUpdateOptions | undefined {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }

  return {
    recomputeTotals: right.recomputeTotals ?? left.recomputeTotals,
    storageDelta: (left.storageDelta ?? 0) + (right.storageDelta ?? 0),
    batchCountShift: composeBatchCountShift(
      left.batchCountShift,
      right.batchCountShift,
    ),
    analysisCountShift: composeAnalysisCountShift(
      left.analysisCountShift,
      right.analysisCountShift,
    ),
    immediate: right.immediate ?? left.immediate,
  };
}

function runScheduledFlush(
  applyBatch: (updates: PendingPhotoUpdate[]) => void,
): void {
  flushTimer = null;
  flushScheduled = false;
  lastFlushAt = Date.now();
  flushPendingPhotoUpdates(applyBatch);
}

function scheduleBatchFlush(
  applyBatch: (updates: PendingPhotoUpdate[]) => void,
): void {
  if (shouldDeferHeavyWorkForNavigation()) {
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        scheduleBatchFlush(applyBatch);
      }, DEFERRED_FLUSH_MS);
    }
    return;
  }

  const elapsed = Date.now() - lastFlushAt;
  const delay = Math.max(0, MIN_FLUSH_INTERVAL_MS - elapsed);

  if (flushScheduled) {
    return;
  }

  flushScheduled = true;

  if (delay === 0) {
    requestAnimationFrame(() => runScheduledFlush(applyBatch));
    return;
  }

  if (flushTimer) {
    clearTimeout(flushTimer);
  }

  flushTimer = setTimeout(() => runScheduledFlush(applyBatch), delay);
}

export function schedulePhotoUpdate(
  update: PendingPhotoUpdate,
  applyBatch: (updates: PendingPhotoUpdate[]) => void,
): void {
  if (update.options?.immediate && shouldDeferHeavyWorkForNavigation()) {
    schedulePhotoUpdate(
      {
        ...update,
        options: {...update.options, immediate: false},
      },
      applyBatch,
    );
    return;
  }

  if (update.options?.immediate) {
    flushPendingPhotoUpdates(applyBatch, {drain: true});
    applyBatch([update]);
    return;
  }

  const key = pendingPhotoKey(update);
  const existing = pendingByPhoto.get(key);

  if (existing) {
    const previousUpdater = existing.updater;
    existing.updater = photo => {
      previousUpdater(photo);
      update.updater(photo);
    };
    existing.options = mergeOptions(existing.options, update.options);
  } else {
    pending.push(update);
    pendingByPhoto.set(key, update);
  }

  scheduleBatchFlush(applyBatch);
}

export function flushPendingPhotoUpdates(
  applyBatch: (updates: PendingPhotoUpdate[]) => void,
  options?: {drain?: boolean},
): void {
  if (pending.length === 0) {
    flushScheduled = false;
    return;
  }

  const drain = options?.drain === true;

  do {
    flushScheduled = false;
    const batch = pending.splice(0, PHOTO_UPDATE_APPLY_CHUNK);
    for (const update of batch) {
      pendingByPhoto.delete(pendingPhotoKey(update));
    }
    const merged = new Map<string, PendingPhotoUpdate>();

    for (const update of batch) {
      const key = `${update.albumId}:${update.photoId}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, {...update});
        continue;
      }

      const previousUpdater = existing.updater;
      existing.updater = photo => {
        previousUpdater(photo);
        update.updater(photo);
      };
      existing.options = mergeOptions(existing.options, update.options);
    }

    applyBatch([...merged.values()]);
  } while (drain && pending.length > 0);

  if (pending.length > 0) {
    scheduleBatchFlush(applyBatch);
  }
}
