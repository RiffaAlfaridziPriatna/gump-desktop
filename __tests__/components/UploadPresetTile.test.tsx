import React from 'react';
import { UploadPresetTile } from '../../src/components/look/UploadPresetTile';
import { getByLabel, press, render } from '../helpers/render';

describe('UploadPresetTile', () => {
  it('is a labelled, keyboard-reachable button, not a radio', () => {
    const { renderer } = render(<UploadPresetTile onPress={jest.fn()} />);
    const tile = getByLabel(renderer, 'Upload preset');
    expect(tile.props.accessibilityRole).toBe('button');
    expect(tile.props.focusable).not.toBe(false);
    expect(tile.props.accessibilityState).toBeUndefined();
  });

  it('calls onPress', () => {
    const onPress = jest.fn();
    const { renderer } = render(<UploadPresetTile onPress={onPress} />);
    press(getByLabel(renderer, 'Upload preset'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
