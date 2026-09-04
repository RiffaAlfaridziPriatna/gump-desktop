import {act} from 'react-test-renderer';
import {useCulledAlbumFilters} from '../src/hooks/useCulledAlbumFilters';
import {useThrottledValue} from '../src/hooks/useThrottledValue';
import {CulledAlbumGridPhoto} from '../src/components/culling/CulledAlbumPhotoGrid';
import {makeCullingPhoto} from './helpers/fixtures';
import {renderHook} from './helpers/render';

describe('useThrottledValue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps the previous value until the delay elapses', () => {
    let value = 'a';
    const hook = renderHook(() => useThrottledValue(value, 200));
    expect(hook.result.current).toBe('a');

    value = 'b';
    hook.rerender();
    expect(hook.result.current).toBe('a');

    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(hook.result.current).toBe('b');
    hook.unmount();
  });
});

describe('useCulledAlbumFilters', () => {
  const photos: CulledAlbumGridPhoto[] = [
    {
      photoId: 'keep',
      disabled: false,
      analysis: makeCullingPhoto({
        photoId: 'keep',
        selected: true,
        aiSelected: true,
        starRating: 5,
      }),
    },
    {
      photoId: 'blur',
      disabled: false,
      analysis: makeCullingPhoto({
        photoId: 'blur',
        blurred: true,
        starRating: 1,
      }),
    },
    {
      photoId: 'unanalyzed',
      disabled: false,
    },
  ];

  it('defaults to AI selected + maybe and reports stats-backed counts', () => {
    const hook = renderHook(() =>
      useCulledAlbumFilters(photos, {
        totalPhotos: 3,
        mySelections: 1,
        aiSelected: 1,
        maybe: 0,
        blurred: 1,
        closedEyes: 0,
        duplicated: 0,
      }),
    );

    expect(hook.result.current.filteredPhotos.map(photo => photo.photoId)).toEqual([
      'keep',
    ]);
    expect(hook.result.current.selectedCount).toBe(1);
    expect(hook.result.current.filterCounts.blurred).toBe(1);
    hook.unmount();
  });

  it('can show blurred photos after toggling that filter on', () => {
    const hook = renderHook(() => useCulledAlbumFilters(photos, null));

    act(() => {
      hook.result.current.toggleFilter('blurred');
    });

    expect(hook.result.current.filteredPhotos.map(photo => photo.photoId)).toEqual([
      'keep',
      'blur',
    ]);
    hook.unmount();
  });

  it('applies star rating and selection grid filters', () => {
    const hook = renderHook(() => useCulledAlbumFilters(photos, null));

    act(() => {
      hook.result.current.setStarRatingFilter([1]);
      hook.result.current.setSelectionFilter('unselected');
    });

    expect(hook.result.current.filteredPhotos.map(photo => photo.photoId)).toEqual(
      [],
    );

    act(() => {
      hook.result.current.toggleFilter('aiSelected');
      hook.result.current.toggleFilter('maybe');
      hook.result.current.toggleFilter('blurred');
    });

    expect(hook.result.current.filteredPhotos.map(photo => photo.photoId)).toEqual([
      'blur',
    ]);
    hook.unmount();
  });
});
