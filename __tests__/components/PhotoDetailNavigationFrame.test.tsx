import React from 'react';
import {Platform, View} from 'react-native';
import {act} from 'react-test-renderer';
import {PhotoDetailNavigationFrame} from '../../src/components/culling/PhotoDetailNavigationFrame';
import {render} from '../helpers/render';

jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => true,
  useFocusEffect: () => undefined,
}));

function mount(onClose = jest.fn()) {
  const view = render(
    <PhotoDetailNavigationFrame
      canGoPrev
      canGoNext
      onPrev={jest.fn()}
      onNext={jest.fn()}
      onClose={onClose}
      showHoverChevrons={false}>
      <View />
    </PhotoDetailNavigationFrame>,
  );
  const frame = view.renderer.root.find(
    node =>
      typeof node.props.onKeyDown === 'function' &&
      Boolean(node.props.keyDownEvents),
  );
  return {onClose, frame};
}

describe('PhotoDetailNavigationFrame Escape', () => {
  it('registers Escape in keyDownEvents', () => {
    const {frame} = mount();
    expect(frame.props.keyDownEvents).toEqual(
      expect.arrayContaining(
        Platform.OS === 'windows'
          ? [{code: 'Escape', handledEventPhase: 3}]
          : [{key: 'Escape'}],
      ),
    );
  });

  it('calls onClose on Escape', () => {
    const {onClose, frame} = mount();
    act(() => {
      frame.props.onKeyDown({nativeEvent: {key: 'Escape'}});
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => {
      frame.props.onKeyDown({nativeEvent: {code: 'Escape'}});
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('does nothing on Escape without onClose', () => {
    const view = render(
      <PhotoDetailNavigationFrame
        canGoPrev={false}
        canGoNext={false}
        onPrev={jest.fn()}
        onNext={jest.fn()}
        showHoverChevrons={false}>
        <View />
      </PhotoDetailNavigationFrame>,
    );
    const frame = view.renderer.root.find(
      node => typeof node.props.onKeyDown === 'function',
    );
    expect(() =>
      act(() => {
        frame.props.onKeyDown({nativeEvent: {key: 'Escape'}});
      }),
    ).not.toThrow();
  });
});
