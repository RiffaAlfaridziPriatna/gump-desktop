import React from 'react';
import {Text} from 'react-native';
import {SimilarShotGroupHeader} from '../../src/components/culling/SimilarShotGroupHeader';
import {render} from '../helpers/render';

describe('SimilarShotGroupHeader', () => {
  it('renders group header with stack icon, announced as header', () => {
    const {renderer} = render(
      <SimilarShotGroupHeader title="Group 1" subtitle="3 shots · 2 picked" isGroup />,
    );
    const text = renderer.root.findByType(Text);
    expect(text.props.accessibilityRole).toBe('header');
    expect(text.props.children).toBe('Group 1 · 3 shots · 2 picked');
    expect(renderer.root.findAllByType('SvgMock' as never)).toHaveLength(1);
  });

  it('renders plain header without icon', () => {
    const {renderer} = render(
      <SimilarShotGroupHeader title="Other matching photos" />,
    );
    const text = renderer.root.findByType(Text);
    expect(text.props.accessibilityRole).toBe('header');
    expect(text.props.children).toBe('Other matching photos');
    expect(renderer.root.findAllByType('SvgMock' as never)).toHaveLength(0);
  });
});
