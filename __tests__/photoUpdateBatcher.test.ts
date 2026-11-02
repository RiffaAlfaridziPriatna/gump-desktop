jest.mock('@lib/navigation/uploadAwareNavigation', () => ({
  shouldDeferHeavyWorkForNavigation: () => false,
}));

import type {PendingPhotoUpdate} from '../src/lib/culledAlbum/photoUpdateBatcher';

type Batcher = typeof import('../src/lib/culledAlbum/photoUpdateBatcher');

// Platform.OS is read at module load, so load a fresh registry per platform.
function loadBatcher(os: 'macos' | 'windows'): Batcher {
  let loaded!: Batcher;
  jest.isolateModules(() => {
    const {Platform} = require('react-native');
    jest.replaceProperty(Platform, 'OS', os);
    loaded = require('../src/lib/culledAlbum/photoUpdateBatcher');
  });
  return loaded;
}

function queueUpdates(
  schedulePhotoUpdate: Batcher['schedulePhotoUpdate'],
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

describe.each(['macos', 'windows'] as const)(
  'photoUpdateBatcher on %s',
  os => {
    let batcher: Batcher;

    beforeEach(() => {
      jest.useFakeTimers();
      batcher = loadBatcher(os);
    });

    afterEach(() => {
      jest.restoreAllMocks();
      batcher.flushPendingPhotoUpdates(jest.fn(), {drain: true});
      jest.useRealTimers();
    });

    function collect(count: number) {
      const applied: number[] = [];
      const applyBatch = (updates: PendingPhotoUpdate[]) => {
        applied.push(updates.length);
      };
      queueUpdates(batcher.schedulePhotoUpdate, count, applyBatch);
      return {applied, applyBatch};
    }

    if (os === 'macos') {
      it('applies at most PHOTO_UPDATE_APPLY_CHUNK per scheduled flush', () => {
        const chunk = batcher.PHOTO_UPDATE_APPLY_CHUNK;
        const {applied, applyBatch} = collect(45);

        batcher.flushPendingPhotoUpdates(applyBatch);
        expect(applied).toEqual([chunk]);

        batcher.flushPendingPhotoUpdates(applyBatch);
        expect(applied).toEqual([chunk, chunk]);

        batcher.flushPendingPhotoUpdates(applyBatch);
        expect(applied).toEqual([chunk, chunk, 5]);
      });
    } else {
      it('drains the whole queue on a scheduled flush', () => {
        const {applied, applyBatch} = collect(45);

        batcher.flushPendingPhotoUpdates(applyBatch);

        expect(applied).toEqual([45]);
      });
    }

    it('drains the full queue when requested', () => {
      const {applied, applyBatch} = collect(45);

      batcher.flushPendingPhotoUpdates(applyBatch, {drain: true});

      if (os === 'macos') {
        expect(applied).toEqual([
          batcher.PHOTO_UPDATE_APPLY_CHUNK,
          batcher.PHOTO_UPDATE_APPLY_CHUNK,
          5,
        ]);
      } else {
        expect(applied).toEqual([45]);
      }
    });
  },
);
