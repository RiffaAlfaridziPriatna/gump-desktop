import React from 'react';
import {StyleSheet} from 'react-native';
import {AlbumLookStatus} from '../../src/components/culling/AlbumLookStatus';
import {CulledAlbumFilterBar} from '../../src/components/culling/CulledAlbumFilterBar';
import {getByLabel, press, render} from '../helpers/render';

describe('AlbumLookStatus', () => {
  it('shows the label and phrase as one accessible element', () => {
    const view = render(
      <AlbumLookStatus lookLabel="Film Mood" onChange={jest.fn()} />,
    );
    expect(
      getByLabel(view.renderer, 'Look: Film Mood. Auto-applies to new photos'),
    ).toBeTruthy();
  });

  it('wraps the outer row on narrow layouts', () => {
    const view = render(
      <AlbumLookStatus lookLabel="Film Mood" onChange={jest.fn()} />,
    );
    const outer = view.renderer.root.findByProps({testID: 'album-look-status'});
    expect(StyleSheet.flatten(outer.props.style).flexWrap).toBe('wrap');
  });

  it('calls onChange from the Change button', () => {
    const onChange = jest.fn();
    const view = render(
      <AlbumLookStatus lookLabel="Film Mood" onChange={onChange} />,
    );
    const button = getByLabel(view.renderer, 'Change album look');
    expect(button.props.accessibilityRole).toBe('button');
    press(button);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('is hidden in the filter bar without a label', () => {
    const props = {
      selectionFilter: null,
      starRatingFilter: [] as number[],
      onSelectionFilterChange: jest.fn(),
      onStarRatingFilterChange: jest.fn(),
      onChangeLook: jest.fn(),
    };
    const view = render(<CulledAlbumFilterBar {...props} />);
    expect(
      view.renderer.root.findAllByProps({
        accessibilityLabel: 'Change album look',
      }),
    ).toHaveLength(0);
    view.rerender(<CulledAlbumFilterBar {...props} lookLabel="Film Mood" />);
    expect(getByLabel(view.renderer, 'Change album look')).toBeTruthy();
  });

  it('does not call onChange when disabled', () => {
    const onChange = jest.fn();
    const view = render(
      <AlbumLookStatus lookLabel="Film Mood" onChange={onChange} disabled />,
    );
    const button = getByLabel(view.renderer, 'Change album look');
    expect(button.props.accessibilityState).toEqual({disabled: true});
    press(button);
    expect(onChange).not.toHaveBeenCalled();
  });
});
