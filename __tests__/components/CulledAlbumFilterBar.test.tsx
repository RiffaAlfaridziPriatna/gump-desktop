import React from 'react';
import {CulledAlbumFilterBar} from '../../src/components/culling/CulledAlbumFilterBar';
import {Pressable} from '../../src/components/ui/Pressable';
import {getByLabel, press, render} from '../helpers/render';

function renderBar(
  overrides: Partial<React.ComponentProps<typeof CulledAlbumFilterBar>> = {},
) {
  const props = {
    selectionFilter: null as const,
    starRatingFilter: [] as number[],
    onSelectionFilterChange: jest.fn(),
    onStarRatingFilterChange: jest.fn(),
    ...overrides,
  };
  const view = render(<CulledAlbumFilterBar {...props} />);
  return {view, props};
}

describe('CulledAlbumFilterBar', () => {
  it('toggles selection filters on and off', () => {
    const {view, props} = renderBar();
    const buttons = view.renderer.root.findAllByType(Pressable);
    press(buttons[0]!);
    expect(props.onSelectionFilterChange).toHaveBeenCalledWith('selected');

    view.rerender(
      <CulledAlbumFilterBar
        {...props}
        selectionFilter="selected"
      />,
    );
    press(view.renderer.root.findAllByType(Pressable)[0]!);
    expect(props.onSelectionFilterChange).toHaveBeenCalledWith(null);
  });

  it('adds and removes star rating chips', () => {
    const {view, props} = renderBar({starRatingFilter: [5]});
    press(getByLabel(view.renderer, 'Filter 5 star photos'));
    expect(props.onStarRatingFilterChange).toHaveBeenCalledWith([]);

    press(getByLabel(view.renderer, 'Filter 3 star photos'));
    expect(props.onStarRatingFilterChange).toHaveBeenCalledWith([5, 3]);
  });
});
