jest.mock('@lib/navigation/uploadAwareNavigation', () => ({
  shouldDeferHeavyWorkForNavigation: () => false,
}));

import {
  flushPendingPhotoUpdates,
  PHOTO_UPDATE_APPLY_CHUNK,
  schedulePhotoUpdate,
  type PendingPhotoUpdate,
} from '../src/lib/culledAlbum/photoUpdateBatcher';

function queueUpdates(
  count: number,
  applyBatch: (updates: PendingPhotoUpdate[]) => void,
): void {
  for (let index = 0; index < count; index += 1) {
    schedulePhotoUpdate(
      {
        albumId: 'album-1',
        photoId: `p${index}`,
        updater: () => undefined,
      },
      applyBatch,
    );
  }
}

describe('photoUpdateBatcher', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    flushPendingPhotoUpdates(jest.fn(), {drain: true});
  });

  afterEach(() => {
    flushPendingPhotoUpdates(jest.fn(), {drain: true});
    jest.useRealTimers();
  });

  it('applies at most PHOTO_UPDATE_APPLY_CHUNK per scheduled flush', () => {
    const applied: number[] = [];
    const applyBatch = (updates: PendingPhotoUpdate[]) => {
      applied.push(updates.length);
    };

    queueUpdates(45, applyBatch);
    flushPendingPhotoUpdates(applyBatch);
    expect(applied).toEqual([PHOTO_UPDATE_APPLY_CHUNK]);

    flushPendingPhotoUpdates(applyBatch);
    expect(applied).toEqual([
      PHOTO_UPDATE_APPLY_CHUNK,
      PHOTO_UPDATE_APPLY_CHUNK,
    ]);

    flushPendingPhotoUpdates(applyBatch);
    expect(applied).toEqual([
      PHOTO_UPDATE_APPLY_CHUNK,
      PHOTO_UPDATE_APPLY_CHUNK,
      5,
    ]);
  });

  it('drains the full queue in apply-sized chunks when requested', () => {
    const applied: number[] = [];
    const applyBatch = (updates: PendingPhotoUpdate[]) => {
      applied.push(updates.length);
    };

    queueUpdates(45, applyBatch);
    flushPendingPhotoUpdates(applyBatch, {drain: true});

    expect(applied.reduce((sum, size) => sum + size, 0)).toBe(45);
    expect(applied.every(size => size <= PHOTO_UPDATE_APPLY_CHUNK)).toBe(true);
  });
});
