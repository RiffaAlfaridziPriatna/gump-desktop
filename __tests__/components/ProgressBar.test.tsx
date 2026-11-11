import React from 'react';
import {StyleSheet, View} from 'react-native';
import {render} from '../helpers/render';
import {ProgressBar} from '../../src/components/ui/ProgressBar';

function radii(height?: number) {
  const {renderer} = render(<ProgressBar progress={0.5} height={height} />);
  const [track, fill] = renderer.root.findAllByType(View);
  return {
    track: StyleSheet.flatten(track.props.style).borderRadius,
    fill: StyleSheet.flatten(fill.props.style).borderRadius,
  };
}

describe('ProgressBar', () => {
  it.each([4, 9, 12, 20])('uses pill radius for height %i', height => {
    expect(radii(height)).toEqual({track: height / 2, fill: height / 2});
  });

  it('uses pill radius for the default height', () => {
    expect(radii()).toEqual({track: 6, fill: 6});
  });

  it('square: flat track with 1px outline and flat fill', () => {
    const {renderer} = render(<ProgressBar square progress={0.5} />);
    const [track, fill] = renderer.root.findAllByType(View);
    const t = StyleSheet.flatten(track.props.style);
    expect(t).toMatchObject({borderWidth: 1, borderColor: '#B7B7B7', height: 12});
    expect(t.borderRadius).toBeUndefined();
    expect(StyleSheet.flatten(fill.props.style).borderRadius).toBe(0);
  });
});
