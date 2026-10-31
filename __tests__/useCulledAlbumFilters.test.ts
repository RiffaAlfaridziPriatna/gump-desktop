import { act } from 'react-test-renderer';
import { createStateStore } from '../src/lib/react/state';
import type { CulledAlbumStoreState } from '../src/lib/culledAlbum/store';
import type { CulledAlbumPhoto } from '../src/lib/culledAlbum/types';

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

import { useCulledAlbumFilters } from '../src/hooks/useCulledAlbumFilters';
import {
  createCulledAlbumFromSelection,
  type CulledAlbumSource,
  type CullingDuplicateGroup,
} from '../src/lib/culledAlbum/types';
import { makeCulledAlbumPhoto, makeCullingPhoto } from './helpers/fixtures';
import { renderHook } from './helpers/render';

const ALBUM_ID = 'album-1';

type Spec = {
  id: string;
  at: number;
  selected?: boolean;
  closedEyes?: boolean;
};

// a,b,c form a group (a is best, not flagged duplicated); d is ungrouped and
// closed-eyed; b is a closed-eyed duplicate.
const SPECS: Spec[] = [
  { id: 'a', at: 1 },
  { id: 'b', at: 2, closedEyes: true },
  { id: 'c', at: 3, selected: true },
  { id: 'd', at: 4, closedEyes: true },
];

function seed(groups: CullingDuplicateGroup[] | undefined, specs = SPECS) {
  const album = createCulledAlbumFromSelection({
    id: ALBUM_ID,
    name: ALBUM_ID,
  } as CulledAlbumSource);
  album.cullingDuplicateGroups = groups;
  mockStore.setState(state => {
    state.albums = { [ALBUM_ID]: album };
  });
  mockPhotos = specs.map(s =>
    makeCulledAlbumPhoto({
      photoId: s.id,
      capturedAt: s.at,
      selected: Boolean(s.selected),
    }),
  );
  return specs.map(s => ({
    photoId: s.id,
    disabled: false,
    analysis: makeCullingPhoto({
      photoId: s.id,
      selected: Boolean(s.selected),
      closedEyes: Boolean(s.closedEyes),
      duplicated: s.id === 'b' || s.id === 'c',
    }),
  }));
}

const GROUPS: CullingDuplicateGroup[] = [
  { groupId: 'g', photoIds: ['a', 'b', 'c'], bestPhotoId: 'a' },
];

function setup(
  groups: CullingDuplicateGroup[] | undefined,
  on: Record<string, boolean>,
  specs?: Spec[],
) {
  const grid = seed(groups, specs);
  const stats = { duplicated: 2 } as never;
  // Saved filters default aiSelected and maybe to on; start from all off.
  const filters = {
    aiSelected: false,
    maybe: false,
    blurred: false,
    closedEyes: false,
    duplicated: false,
    ...on,
  };
  return renderHook(() =>
    useCulledAlbumFilters(grid, stats, filters, ALBUM_ID),
  );
}

const ids = (h: ReturnType<typeof setup>) =>
  h.result.current.gridView.photos.map(p => p.photoId);

afterEach(() => {
  mockPhotos = [];
  mockStore.setState(state => {
    state.albums = {};
  });
});

describe('useCulledAlbumFilters Similar Shots', () => {
  it('shows every member including the best photo and counts them in the sidebar', () => {
    const hook = setup(GROUPS, { duplicated: true });
    const { sections, photos } = hook.result.current.gridView;
    expect(ids(hook)).toEqual(['a', 'b', 'c']);
    expect(sections).toEqual([
      {
        key: 'group-1',
        title: 'Group 1',
        subtitle: '3 shots · 1 picked',
        isGroup: true,
        photoIds: ['a', 'b', 'c'],
      },
    ]);
    expect(hook.result.current.filterCounts.duplicated).toBe(photos.length);
    hook.unmount();
  });

  it('with Closed Eyes keeps matching members and ungrouped matches; header counts stay full', () => {
    const hook = setup(GROUPS, { duplicated: true, closedEyes: true });
    const { sections } = hook.result.current.gridView;
    expect(sections?.map(s => [s.key, s.photoIds, s.subtitle])).toEqual([
      ['group-1', ['b'], '3 shots · 1 picked'],
      ['other', ['d'], undefined],
    ]);
    expect(sections?.[1]?.title).toBe('Other matching photos');
    hook.unmount();
  });

  it('hides a group with no matching member', () => {
    const hook = setup(GROUPS, { duplicated: true, maybe: true });
    expect(hook.result.current.gridView.sections).toEqual([]);
    expect(ids(hook)).toEqual([]);
    hook.unmount();
  });

  it('applies the selection filter per photo and hides emptied groups', () => {
    const hook = setup(GROUPS, { duplicated: true });
    act(() => hook.result.current.setSelectionFilter('selected'));
    expect(ids(hook)).toEqual(['c']);
    expect(hook.result.current.gridView.sections?.[0]?.subtitle).toBe(
      '3 shots · 1 picked',
    );
    act(() => hook.result.current.setSelectionFilter('unselected'));
    expect(ids(hook)).toEqual(['a', 'b']);
    hook.unmount();
    const none = setup(GROUPS, { duplicated: true });
    act(() => none.result.current.setStarRatingFilter([5]));
    expect(none.result.current.gridView.sections).toEqual([]);
    none.unmount();
  });

  it('falls back to the flat duplicated list and stats count without groups', () => {
    const hook = setup(undefined, { duplicated: true });
    expect(hook.result.current.gridView.sections).toBeUndefined();
    expect(ids(hook)).toEqual(['b', 'c']);
    expect(hook.result.current.filterCounts.duplicated).toBe(2);
    hook.unmount();
  });

  it('leaves the flat list alone when Similar Shots is off', () => {
    const hook = setup(GROUPS, { closedEyes: true });
    expect(hook.result.current.gridView.sections).toBeUndefined();
    expect(ids(hook)).toEqual(['d']);
    expect(hook.result.current.filterCounts.duplicated).toBe(3);
    hook.unmount();
  });

  it('updates the picked count on a pick toggle and keeps structure and keys', () => {
    const hook = setup(GROUPS, { duplicated: true });
    const before = hook.result.current;
    const groupsBefore =
      mockStore.getState().albums[ALBUM_ID]!.cullingDuplicateGroups;
    mockPhotos = mockPhotos.map(p =>
      p.photoId === 'a' ? { ...p, selected: true } : p,
    );
    hook.rerender();
    const after = hook.result.current;
    expect(after.gridView.sections?.[0]?.subtitle).toBe('3 shots · 2 picked');
    expect(after.gridView.sections?.map(x => x.key)).toEqual(
      before.gridView.sections?.map(x => x.key),
    );
    expect(after.gridView.photos).toBe(before.gridView.photos);
    expect(mockStore.getState().albums[ALBUM_ID]!.cullingDuplicateGroups).toBe(
      groupsBefore,
    );
    hook.unmount();
  });

  it.each([[{ duplicated: true }], [{ duplicated: true, closedEyes: true }]])(
    'acts on exactly the shown photos: %j',
    on => {
      const hook = setup(GROUPS, on);
      expect(hook.result.current.actionPhotos).toBe(
        hook.result.current.gridView.photos,
      );
      expect(hook.result.current.actionCount).toBe(
        hook.result.current.gridView.photos.length,
      );
      hook.unmount();
    },
  );

  it('combines selection, star and another category', () => {
    const grid = seed(GROUPS);
    grid.find(p => p.photoId === 'b')!.analysis.starRating = 5;
    grid.find(p => p.photoId === 'b')!.analysis.selected = true;
    const filters = {
      aiSelected: false,
      maybe: false,
      blurred: false,
      closedEyes: true,
      duplicated: true,
    };
    const hook = renderHook(() =>
      useCulledAlbumFilters(grid, null, filters, ALBUM_ID),
    );
    act(() => {
      hook.result.current.setSelectionFilter('selected');
      hook.result.current.setStarRatingFilter([5]);
    });
    expect(
      hook.result.current.gridView.sections?.map(x => [x.key, x.photoIds]),
    ).toEqual([['group-1', ['b']]]);
    hook.unmount();
  });

  it('is empty for an empty album with Similar Shots on', () => {
    const hook = setup(GROUPS, { duplicated: true }, []);
    expect(hook.result.current.gridView.photos).toEqual([]);
    expect(hook.result.current.filterCounts.duplicated).toBe(2);
    hook.unmount();
  });

  it('skips members missing from the grid or lacking analysis; count stays derived from groups', () => {
    const grid = seed(GROUPS);
    const partial = grid
      .filter(p => p.photoId !== 'c')
      .map(p => (p.photoId === 'b' ? { ...p, analysis: undefined } : p));
    const filters = {
      aiSelected: false,
      maybe: false,
      blurred: false,
      closedEyes: false,
      duplicated: true,
    };
    const hook = renderHook(() =>
      useCulledAlbumFilters(partial, null, filters, ALBUM_ID),
    );
    expect(ids(hook)).toEqual(['a']);
    expect(hook.result.current.filterCounts.duplicated).toBe(3);
    hook.unmount();
  });

  it('shows a photo stored in two groups once', () => {
    const groups: CullingDuplicateGroup[] = [
      { groupId: 'g1', photoIds: ['a', 'b'], bestPhotoId: 'a' },
      { groupId: 'g2', photoIds: ['b', 'c'], bestPhotoId: 'c' },
    ];
    const hook = setup(groups, { duplicated: true });
    expect(hook.result.current.gridView.sections?.map(x => x.photoIds)).toEqual(
      [['a', 'b'], ['c']],
    );
    expect(ids(hook)).toEqual(['a', 'b', 'c']);
    hook.unmount();
  });
});
