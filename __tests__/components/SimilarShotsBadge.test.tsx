import React from 'react';
import {StyleSheet, Text} from 'react-native';
import {SimilarShotsBadge} from '../../src/components/culling/SimilarShotsBadge';
import {fonts} from '../../src/lib/ui/typography';
import {getAllByRole, render} from '../helpers/render';

describe('SimilarShotsBadge', () => {
  it('is a labelled button showing the count', () => {
    const {renderer} = render(<SimilarShotsBadge count={3} onPress={jest.fn()} />);
    const [button] = getAllByRole(renderer, 'button');
    expect(button?.props.focusable).toBe(true);
    expect(button?.props.accessibilityLabel).toBe('3 similar shots, open viewer');
    expect(renderer.root.findByType(Text).props.children).toBe('3 similar shots');
  });

  it('matches the Figma chip: alpha, height, offsets, Inter SemiBold, icons', () => {
    const {renderer} = render(<SimilarShotsBadge count={3} onPress={jest.fn()} />);
    const [button] = getAllByRole(renderer, 'button');
    const chip = StyleSheet.flatten(button?.props.style);
    expect(chip).toMatchObject({
      height: 23,
      paddingHorizontal: 8,
      gap: 4,
      backgroundColor: 'rgba(19,20,21,0.75)',
    });
    const row = StyleSheet.flatten(
      renderer.root.findAll(n => n.props.pointerEvents === 'box-none')[0]?.props.style,
    );
    expect(row).toMatchObject({left: 8, bottom: 8});
    const label = StyleSheet.flatten(renderer.root.findByType(Text).props.style);
    expect(label).toMatchObject({fontFamily: fonts.interSemiBold, fontSize: 12, color: '#FFFFFF'});
    const icons = renderer.root.findAll(n => (n.type as {displayName?: string}).displayName === 'SvgMock');
    expect(icons.map(i => [i.props.width, i.props.height])).toEqual([
      [10.6783, 10.6692],
      [12, 12],
    ]);
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
