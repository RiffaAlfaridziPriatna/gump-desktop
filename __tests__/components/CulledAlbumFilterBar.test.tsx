import React from 'react';
import {Text} from 'react-native';
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
    onUploadSelected: jest.fn(),
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

  it('shows selected count and disables upload when empty', () => {
    const idle = renderBar({selectedCount: 4});
    expect(
      idle.view.renderer.root.findAllByType(Text).some(
        node => node.props.children === 'Upload Selected (4)',
      ),
    ).toBe(true);
    press(getByLabel(idle.view.renderer, 'Upload selected photos'));
    expect(idle.props.onUploadSelected).toHaveBeenCalledTimes(1);

    const disabled = renderBar({
      selectedCount: 0,
      uploadDisabled: true,
      onUploadSelected: jest.fn(),
    });
    expect(
      disabled.view.renderer.root.findAllByType(Text).some(
        node => node.props.children === 'Upload Selected',
      ),
    ).toBe(true);
    press(getByLabel(disabled.view.renderer, 'Upload selected photos'));
    expect(disabled.props.onUploadSelected).not.toHaveBeenCalled();
  });

  it('shows culling in progress instead of upload actions', () => {
    const {view, props} = renderBar({
      cullingInProgress: true,
      onAddPhotos: jest.fn(),
      onUploadSelected: jest.fn(),
    });
    expect(
      view.renderer.root.findAllByType(Text).some(
        node => node.props.children === 'Culling in Progress...',
      ),
    ).toBe(true);
    expect(props.onUploadSelected).not.toHaveBeenCalled();
  });
});
