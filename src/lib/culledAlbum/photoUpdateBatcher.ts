import {shouldDeferHeavyWorkForNavigation} from '@lib/navigation/uploadAwareNavigation';
import type {CulledAlbumPhoto, LocalImportCountKey} from './types';

export type PhotoUpdateOptions = {
  recomputeTotals?: boolean;
  storageDelta?: number;
  batchCountShift?: {
    from: LocalImportCountKey;
    to: LocalImportCountKey;
  };
  immediate?: boolean;
};

export type PendingPhotoUpdate = {
  albumId: string;
  photoId: string;
  updater: (photo: CulledAlbumPhoto) => void;
  options?: PhotoUpdateOptions;
};

const MIN_FLUSH_INTERVAL_MS = 120;
const DEFERRED_FLUSH_MS = 50;

let pending: PendingPhotoUpdate[] = [];
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

function composeBatchCountShift(
  left?: PhotoUpdateOptions['batchCountShift'],
  right?: PhotoUpdateOptions['batchCountShift'],
): PhotoUpdateOptions['batchCountShift'] {
  if (!left) {
    return right;
  }
  if (!right) {
    return left;
  }

  // Chain transitions for the same photo (e.g. pending→uploading then
  // uploading→uploaded) into a single net shift (pending→uploaded) so no
  // intermediate transition is dropped when updates are batched together.
  return {from: left.from, to: right.to};
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
    flushPendingPhotoUpdates(applyBatch);
    applyBatch([update]);
    return;
  }

  const existing = pending.find(
    item => item.albumId === update.albumId && item.photoId === update.photoId,
  );

  if (existing) {
    const previousUpdater = existing.updater;
    existing.updater = photo => {
      previousUpdater(photo);
      update.updater(photo);
    };
    existing.options = mergeOptions(existing.options, update.options);
  } else {
    pending.push(update);
  }

  scheduleBatchFlush(applyBatch);
}

export function flushPendingPhotoUpdates(
  applyBatch: (updates: PendingPhotoUpdate[]) => void,
): void {
  if (pending.length === 0) {
    flushScheduled = false;
    return;
  }

  flushScheduled = false;
  const batch = pending.splice(0);
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
}
