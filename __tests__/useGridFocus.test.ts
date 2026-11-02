import {act} from 'react-test-renderer';
import {useGridFocus} from '../src/hooks/useGridFocus';
import {renderHook} from './helpers/render';

const A = [{photoId: 'a'}, {photoId: 'b'}];

function setup() {
  const onOpenDetail = jest.fn();
  let photos = A;
  const hook = renderHook(() => useGridFocus(photos, onOpenDetail));
  const setPhotos = (next: typeof A) => {
    photos = next;
    act(() => hook.rerender());
  };
  return {hook, onOpenDetail, setPhotos};
}

describe('useGridFocus', () => {
  it('first press focuses without opening', () => {
    const {hook, onOpenDetail} = setup();
    act(() => hook.result.current.handleCardPress('a'));
    expect(hook.result.current.focusedPhotoId).toBe('a');
    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  it('second press on the same photo opens detail', () => {
    const {hook, onOpenDetail} = setup();
    act(() => hook.result.current.handleCardPress('a'));
    act(() => hook.result.current.handleCardPress('a'));
    expect(onOpenDetail).toHaveBeenCalledWith('a');
  });

  it('press on another photo moves focus', () => {
    const {hook, onOpenDetail} = setup();
    act(() => hook.result.current.handleCardPress('a'));
    act(() => hook.result.current.handleCardPress('b'));
    expect(hook.result.current.focusedPhotoId).toBe('b');
    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  it('clears focus when the photo leaves the shown set', () => {
    const {hook, setPhotos} = setup();
    act(() => hook.result.current.handleCardPress('a'));
    setPhotos([{photoId: 'b'}]);
    expect(hook.result.current.focusedPhotoId).toBeNull();
  });

  it('clearFocus clears', () => {
    const {hook} = setup();
    act(() => hook.result.current.handleCardPress('a'));
    act(() => hook.result.current.clearFocus());
    expect(hook.result.current.focusedPhotoId).toBeNull();
  });

  it('focus stays across a rerender (viewer return)', () => {
    const {hook, setPhotos} = setup();
    act(() => hook.result.current.handleCardPress('a'));
    setPhotos([...A]);
    expect(hook.result.current.focusedPhotoId).toBe('a');
  });
});
