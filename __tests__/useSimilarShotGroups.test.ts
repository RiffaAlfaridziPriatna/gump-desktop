import { act } from 'react-test-renderer';
import { createStateStore } from '../src/lib/react/state';
import type { CulledAlbumStoreState } from '../src/lib/culledAlbum/store';
import type { CulledAlbumPhoto } from '../src/lib/culledAlbum/types';

// The real store pulls in storage/navigation native modules; use a same-shape
// store created through the project's createStateStore.
const mockStore = createStateStore<CulledAlbumStoreState>({
  albums: {},
  error: null,
});
let mockPhotos: CulledAlbumPhoto[] = [];
jest.mock('@context/culledAlbum', () => ({
  useCulledAlbumStore: (selector: (state: CulledAlbumStoreState) => unknown) =>
    require('../src/lib/react/state').useStateStore(mockStore, selector),
  useCulledAlbumPhotosState: () => mockPhotos,
}));

import { useSimilarShotGroups } from '../src/hooks/useSimilarShotGroups';
import {
  createCulledAlbumFromSelection,
  type CulledAlbumSource,
  type CullingDuplicateGroup,
} from '../src/lib/culledAlbum/types';
import { makeCulledAlbumPhoto } from './helpers/fixtures';
import { renderHook } from './helpers/render';

const ALBUM_ID = 'album-1';

function photo(photoId: string, capturedAt: number, selected = false) {
  return makeCulledAlbumPhoto({ photoId, capturedAt, selected });
}

function group(groupId: string, photoIds: string[]): CullingDuplicateGroup {
  return { groupId, photoIds, bestPhotoId: photoIds[0]! };
}

function seedAlbum(groups: CullingDuplicateGroup[] | undefined) {
  const album = createCulledAlbumFromSelection({
    id: ALBUM_ID,
    name: ALBUM_ID,
  } as CulledAlbumSource);
  album.cullingDuplicateGroups = groups;
  mockStore.setState(state => {
    state.albums = { [ALBUM_ID]: album };
  });
}

describe('useSimilarShotGroups', () => {
  afterEach(() => {
    mockPhotos = [];
    mockStore.setState(state => {
      state.albums = {};
    });
  });

  it('returns empty results without throwing when groups are undefined', () => {
    seedAlbum(undefined);
    const hook = renderHook(() => useSimilarShotGroups(ALBUM_ID));
    expect(hook.result.current.hasGroups).toBe(false);
    expect(hook.result.current.orderedGroups).toEqual([]);
    expect(hook.result.current.groupIndexByPhotoId.size).toBe(0);
    expect(hook.result.current.summaryFor(0)).toBeUndefined();
    hook.unmount();
  });

  it('is empty for an unknown album', () => {
    const hook = renderHook(() => useSimilarShotGroups('missing'));
    expect(hook.result.current.hasGroups).toBe(false);
    hook.unmount();
  });

  it('indexes the ordered groups so index + 1 is the Group n number', () => {
    // Stored order is reversed relative to capture order.
    seedAlbum([group('late', ['c', 'd']), group('early', ['a', 'b'])]);
    mockPhotos = [photo('a', 1), photo('b', 2), photo('c', 3), photo('d', 4)];
    const hook = renderHook(() => useSimilarShotGroups(ALBUM_ID));
    const { orderedGroups, groupIndexByPhotoId } = hook.result.current;
    expect(orderedGroups.map(g => g.groupId)).toEqual(['early', 'late']);
    expect(groupIndexByPhotoId.get('a')).toBe(0);
    expect(groupIndexByPhotoId.get('c')).toBe(1);
    expect(hook.result.current.hasGroups).toBe(true);
    hook.unmount();
  });

  it('summarizes picked and shot counts per group', () => {
    seedAlbum([group('g', ['a', 'b', 'c'])]);
    mockPhotos = [photo('a', 1, true), photo('b', 2), photo('c', 3, true)];
    const hook = renderHook(() => useSimilarShotGroups(ALBUM_ID));
    expect(hook.result.current.summaryFor(0)).toEqual({
      shotCount: 3,
      pickedCount: 2,
    });
    hook.unmount();
  });

  it('re-derives only when the groups reference or photo list changes', () => {
    seedAlbum([group('g', ['a', 'b'])]);
    mockPhotos = [photo('a', 1), photo('b', 2)];
    const hook = renderHook(() => useSimilarShotGroups(ALBUM_ID));
    const first = hook.result.current;

    hook.rerender();
    expect(hook.result.current.orderedGroups).toBe(first.orderedGroups);
    expect(hook.result.current.summaryFor).toBe(first.summaryFor);

    act(() => {
      mockStore.setState(state => {
        state.albums[ALBUM_ID]!.name = 'renamed';
      });
    });
    hook.rerender();
    expect(hook.result.current.orderedGroups).toBe(first.orderedGroups);
    expect(hook.result.current.groupIndexByPhotoId).toBe(
      first.groupIndexByPhotoId,
    );
    expect(hook.result.current.summaryFor).toBe(first.summaryFor);

    act(() => {
      mockStore.setState(state => {
        state.albums[ALBUM_ID]!.cullingDuplicateGroups = [
          group('g2', ['a', 'b']),
        ];
      });
    });
    const afterGroups = hook.result.current;
    expect(afterGroups.orderedGroups).not.toBe(first.orderedGroups);

    mockPhotos = [...mockPhotos, photo('c', 3)];
    act(() => {
      mockStore.setState(state => {
        state.albums[ALBUM_ID]!.cullingDuplicateGroups = [
          group('g2', ['a', 'b', 'c']),
        ];
      });
    });
    expect(hook.result.current.orderedGroups).not.toBe(
      afterGroups.orderedGroups,
    );
    expect(hook.result.current.orderedGroups[0]!.photoIds).toEqual([
      'a',
      'b',
      'c',
    ]);
    hook.unmount();
  });

  it('re-derives when only the photo list changes membership', () => {
    seedAlbum([group('g', ['a', 'b', 'c'])]);
    mockPhotos = [photo('a', 1), photo('b', 2)];
    const hook = renderHook(() => useSimilarShotGroups(ALBUM_ID));
    const first = hook.result.current;
    expect(first.orderedGroups[0]!.photoIds).toEqual(['a', 'b']);

    mockPhotos = [...mockPhotos, photo('c', 3)];
    hook.rerender();
    expect(hook.result.current.orderedGroups).not.toBe(first.orderedGroups);
    expect(hook.result.current.orderedGroups[0]!.photoIds).toEqual([
      'a',
      'b',
      'c',
    ]);
    hook.unmount();
  });

  it('keeps groups and index stable when a pick changes the photo list', () => {
    seedAlbum([group('g', ['a', 'b'])]);
    mockPhotos = [photo('a', 1), photo('b', 2)];
    const hook = renderHook(() => useSimilarShotGroups(ALBUM_ID));
    const first = hook.result.current;
    expect(first.summaryFor(0)?.pickedCount).toBe(0);

    mockPhotos = [photo('a', 1, true), photo('b', 2)];
    hook.rerender();
    expect(hook.result.current.orderedGroups).toBe(first.orderedGroups);
    expect(hook.result.current.groupIndexByPhotoId).toBe(
      first.groupIndexByPhotoId,
    );
    expect(hook.result.current.summaryFor(0)?.pickedCount).toBe(1);
    hook.unmount();
  });
});
