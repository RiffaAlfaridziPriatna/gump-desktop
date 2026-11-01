import React from 'react';
import {Image, Text} from 'react-native';
import {SimilarShotGroupHeader} from '../../src/components/culling/SimilarShotGroupHeader';
import {render} from '../helpers/render';

describe('SimilarShotGroupHeader', () => {
  it('renders group header with hidden layers icon, announced as header', () => {
    const {renderer} = render(
      <SimilarShotGroupHeader
        section={{title: 'Group 1', subtitle: '3 shots · 2 picked', isGroup: true}}
      />,
    );
    const text = renderer.root.findByType(Text);
    expect(text.props.accessibilityRole).toBe('header');
    expect(text.props.numberOfLines).toBe(1);
    expect(text.props.accessibilityLabel).toBe('Group 1, 3 shots, 2 picked');
    expect(text.props.children).toBe('Group 1 · 3 shots · 2 picked');
    expect(renderer.root.findAllByType(Image)).toHaveLength(1);
  });

  it('renders plain header without icon', () => {
    const {renderer} = render(
      <SimilarShotGroupHeader section={{title: 'Other matching photos'}} />,
    );
    const text = renderer.root.findByType(Text);
    expect(text.props.accessibilityRole).toBe('header');
    expect(text.props.accessibilityLabel).toBe('Other matching photos');
    expect(text.props.children).toBe('Other matching photos');
    expect(renderer.root.findAllByType(Image)).toHaveLength(0);
  });
});
