import React from 'react';
import {StyleSheet} from 'react-native';
import {render} from '../helpers/render';
import {ModalDecorations} from '../../src/components/modals/ModalDecorations';

function shapes() {
  const {renderer} = render(<ModalDecorations />);
  return renderer.root
    .findAll(n => (n.type as unknown) === 'SvgMock')
    .map(n => ({
      width: n.props.width,
      height: n.props.height,
      style: StyleSheet.flatten(n.props.style),
    }));
}

describe('ModalDecorations', () => {
  it('renders the five shapes at the Figma offsets', () => {
    const offsets = shapes().map(({style: s}) => ({
      top: s.top,
      bottom: s.bottom,
      left: s.left,
      right: s.right,
    }));
    expect(offsets).toHaveLength(5);
    expect(offsets).toEqual(
      expect.arrayContaining([
        {top: 0, bottom: undefined, left: 0, right: undefined},
        {top: 0, bottom: undefined, left: undefined, right: 0},
        {top: 80, bottom: undefined, left: undefined, right: 0},
        {top: undefined, bottom: 24, left: 24, right: undefined},
        {top: undefined, bottom: 0, left: undefined, right: 0},
      ]),
    );
  });

  it('sizes the shapes and stays out of the accessibility tree', () => {
    const sizes = shapes().map(s => [s.width, s.height]);
    expect(sizes).toEqual(
      expect.arrayContaining([
        [80, 80],
        [32, 32],
        [72, undefined],
        [98, 98],
        [36, 36],
      ]),
    );
    const {renderer} = render(<ModalDecorations />);
    expect(
      renderer.root.findByProps({pointerEvents: 'none'}).props,
    ).toMatchObject({
      accessibilityElementsHidden: true,
      importantForAccessibility: 'no-hide-descendants',
    });
  });
});
