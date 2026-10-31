import React from 'react';
import {Text} from 'react-native';
import {SimilarShotsBadge} from '../../src/components/culling/SimilarShotsBadge';
import {getAllByRole, render} from '../helpers/render';

describe('SimilarShotsBadge', () => {
  it('is a labelled button showing the count', () => {
    const {renderer} = render(<SimilarShotsBadge count={3} onPress={jest.fn()} />);
    const [button] = getAllByRole(renderer, 'button');
    expect(button?.props.focusable).toBe(true);
    expect(button?.props.accessibilityLabel).toBe('3 similar shots, open viewer');
    expect(renderer.root.findByType(Text).props.children).toBe('3 similar shots ›');
  });

  it('calls onPress and stops the press from reaching the card', () => {
    const onPress = jest.fn();
    const stopPropagation = jest.fn();
    const {renderer} = render(<SimilarShotsBadge count={2} onPress={onPress} />);
    const [button] = getAllByRole(renderer, 'button');
    button?.props.onPress({stopPropagation});
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
