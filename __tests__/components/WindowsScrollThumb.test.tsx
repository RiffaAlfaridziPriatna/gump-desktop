import React from 'react';
import {StyleSheet, View} from 'react-native';
import {render} from '../helpers/render';
import {WindowsScrollThumb} from '../../src/components/modals/WindowsScrollThumb';

function thumbStyle(scrollOffset: number) {
  const {renderer} = render(
    <WindowsScrollThumb
      viewportHeight={408}
      contentHeight={816}
      scrollOffset={scrollOffset}
    />,
  );
  const views = renderer.root.findAllByType(View);
  return StyleSheet.flatten(views[views.length - 1].props.style);
}

describe('WindowsScrollThumb', () => {
  it('renders nothing when the content fits', () => {
    const {renderer} = render(
      <WindowsScrollThumb
        viewportHeight={803}
        contentHeight={803.5}
        scrollOffset={0}
      />,
    );
    expect(renderer.toJSON()).toBeNull();
  });

  it('sizes the thumb to the visible share and moves it with the offset', () => {
    // Track 400 (408 - 2 * 4 inset), half visible: thumb 200, travel 200.
    expect(thumbStyle(0)).toMatchObject({
      height: 200,
      transform: [{translateY: 4}],
    });
    expect(thumbStyle(408)).toMatchObject({transform: [{translateY: 204}]});
    expect(thumbStyle(2000)).toMatchObject({transform: [{translateY: 204}]});
  });
});
