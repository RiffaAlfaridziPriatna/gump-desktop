import { act } from 'react-test-renderer';
import { createStateStore } from '../src/lib/react/state';
import type { CulledAlbumStoreState } from '../src/lib/culledAlbum/store';

// The real store pulls in storage/navigation native modules; use a same-shape
// store created through the project's createStateStore.
const mockStore = createStateStore<CulledAlbumStoreState>({
  albums: {},
  error: null,
});
jest.mock('@context/culledAlbum', () => ({
  useCulledAlbumStore: (selector: (state: CulledAlbumStoreState) => unknown) =>
     
    require('../src/lib/react/state').useStateStore(mockStore, selector),
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
    mockStore.setState(state => {
      state.albums = {};
    });
  });

  it('returns empty results without throwing when groups are undefined', () => {
    seedAlbum(undefined);
    const hook = renderHook(() => useSimilarShotGroups(ALBUM_ID, []));
    expect(hook.result.current.hasGroups).toBe(false);
    expect(hook.result.current.orderedGroups).toEqual([]);
    expect(hook.result.current.groupIndexByPhotoId.size).toBe(0);
    expect(hook.result.current.summaryFor(0)).toBeUndefined();
    hook.unmount();
  });

  it('is empty for an unknown album', () => {
    const hook = renderHook(() => useSimilarShotGroups('missing', []));
    expect(hook.result.current.hasGroups).toBe(false);
    hook.unmount();
  });

  it('indexes the ordered groups so index + 1 is the Group n number', () => {
    // Stored order is reversed relative to capture order.
    seedAlbum([group('late', ['c', 'd']), group('early', ['a', 'b'])]);
    const photos = [photo('a', 1), photo('b', 2), photo('c', 3), photo('d', 4)];
    const hook = renderHook(() => useSimilarShotGroups(ALBUM_ID, photos));
    const { orderedGroups, groupIndexByPhotoId } = hook.result.current;
    expect(orderedGroups.map(g => g.groupId)).toEqual(['early', 'late']);
    expect(groupIndexByPhotoId.get('a')).toBe(0);
    expect(groupIndexByPhotoId.get('c')).toBe(1);
    expect(hook.result.current.hasGroups).toBe(true);
    hook.unmount();
  });

  it('summarizes picked and shot counts per group', () => {
    seedAlbum([group('g', ['a', 'b', 'c'])]);
    const photos = [photo('a', 1, true), photo('b', 2), photo('c', 3, true)];
    const hook = renderHook(() => useSimilarShotGroups(ALBUM_ID, photos));
    expect(hook.result.current.summaryFor(0)).toEqual({
      shotCount: 3,
      pickedCount: 2,
    });
    hook.unmount();
  });

  it('re-derives only when the groups reference or photo list changes', () => {
    seedAlbum([group('g', ['a', 'b'])]);
    const photos = [photo('a', 1), photo('b', 2)];
    const hook = renderHook(() => useSimilarShotGroups(ALBUM_ID, photos));
    const first = hook.result.current;

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

    act(() => {
      mockStore.setState(state => {
        state.albums[ALBUM_ID]!.cullingDuplicateGroups = [
          group('g2', ['a', 'b']),
        ];
      });
    });
    expect(hook.result.current.orderedGroups).not.toBe(first.orderedGroups);
    const afterGroups = hook.result.current;

    photos.push(photo('c', 3));
    const nextPhotos = [...photos];
    const rerendered = renderHook(() =>
      useSimilarShotGroups(ALBUM_ID, nextPhotos),
    );
    expect(rerendered.result.current.orderedGroups).not.toBe(
      afterGroups.orderedGroups,
    );
    rerendered.unmount();
    hook.unmount();
  });
});
