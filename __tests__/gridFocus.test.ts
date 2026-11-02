import {act} from 'react-test-renderer';
import {useGridFocus} from '../src/hooks/useGridFocus';
import {
  cardPressAction,
  resolveFocusedPhotoId,
} from '../src/lib/culledAlbum/gridFocus';
import {renderHook} from './helpers/render';

const shown = [{photoId: 'a'}, {photoId: 'b'}];

describe('gridFocus logic', () => {
  it('keeps focus only while the photo is shown', () => {
    expect(resolveFocusedPhotoId('a', shown)).toBe('a');
    expect(resolveFocusedPhotoId('z', shown)).toBeNull();
    expect(resolveFocusedPhotoId(null, shown)).toBeNull();
  });

  it('focuses on first press, opens on the focused photo', () => {
    expect(cardPressAction(null, 'a')).toBe('focus');
    expect(cardPressAction('b', 'a')).toBe('focus');
    expect(cardPressAction('a', 'a')).toBe('open');
  });
});

describe('useGridFocus', () => {
  it('first press focuses, second opens, another photo moves focus', () => {
    const onOpen = jest.fn();
    const {result} = renderHook(() => useGridFocus(shown, onOpen));
    act(() => result.current.handleCardPress('a'));
    expect(result.current.focusedPhotoId).toBe('a');
    expect(onOpen).not.toHaveBeenCalled();
    act(() => result.current.handleCardPress('b'));
    expect(result.current.focusedPhotoId).toBe('b');
    act(() => result.current.handleCardPress('b'));
    expect(onOpen).toHaveBeenCalledWith('b');
    expect(result.current.focusedPhotoId).toBe('b');
  });

  it('clears on empty-area click and when the photo leaves the shown set', () => {
    const onOpen = jest.fn();
    let photos = shown;
    const {result, rerender} = renderHook(() => useGridFocus(photos, onOpen));
    act(() => result.current.handleCardPress('a'));
    act(() => result.current.clearFocus());
    expect(result.current.focusedPhotoId).toBeNull();

    act(() => result.current.handleCardPress('a'));
    photos = [{photoId: 'b'}];
    act(() => rerender());
    expect(result.current.focusedPhotoId).toBeNull();
    photos = shown;
    act(() => rerender());
    expect(result.current.focusedPhotoId).toBeNull();
  });
});
