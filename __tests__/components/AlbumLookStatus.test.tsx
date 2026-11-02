import React from 'react';
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
});
