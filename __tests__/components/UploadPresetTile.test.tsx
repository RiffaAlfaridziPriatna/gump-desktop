import React from 'react';
import { UploadPresetTile } from '../../src/components/look/UploadPresetTile';
import { act } from 'react-test-renderer';
import { colors } from '../../src/lib/ui/colors';
import { getByLabel, press, render } from '../helpers/render';

describe('UploadPresetTile', () => {
  it('is a labelled, keyboard-reachable button, not a radio', () => {
    const { renderer } = render(<UploadPresetTile onPress={jest.fn()} />);
    const tile = getByLabel(renderer, 'Upload preset');
    expect(tile.props.accessibilityRole).toBe('button');
    expect(tile.props.focusable).not.toBe(false);
    expect(tile.props.accessibilityState).toBeUndefined();
  });

  it('is disabled when no handler is wired', () => {
    const { renderer } = render(<UploadPresetTile />);
    expect(getByLabel(renderer, 'Upload preset').props.disabled).toBe(true);
  });

  it('shows an accent border while focused', () => {
    const { renderer } = render(<UploadPresetTile onPress={jest.fn()} />);
    const borderColor = () => {
      const tile = getByLabel(renderer, 'Upload preset');
      const style = tile.props.style;
      return []
        .concat(typeof style === 'function' ? style({ pressed: false }) : style)
        .flat()
        .filter(Boolean)
        .reduce((a: object, b: object) => ({ ...a, ...b }), {}).borderColor;
    };
    expect(borderColor()).toBe(colors.borderLight);
    act(() => getByLabel(renderer, 'Upload preset').props.onFocus());
    expect(borderColor()).toBe(colors.accent);
    act(() => getByLabel(renderer, 'Upload preset').props.onBlur());
    expect(borderColor()).toBe(colors.borderLight);
  });

  it('calls onPress', () => {
    const onPress = jest.fn();
    const { renderer } = render(<UploadPresetTile onPress={onPress} />);
    press(getByLabel(renderer, 'Upload preset'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
