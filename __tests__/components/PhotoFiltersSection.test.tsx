import React from 'react';
import {PhotoFiltersSection} from '../../src/components/culling/PhotoFiltersSection';
import {getByLabel, press, render} from '../helpers/render';

type Props = React.ComponentProps<typeof PhotoFiltersSection>;

function setup(overrides: Partial<Props> = {}) {
  const props: Props = {
    expanded: true,
    onToggle: jest.fn(),
    totalCount: 635,
    pickedCount: 0,
    selectionFilter: null,
    hasActiveFilter: false,
    onShowAll: jest.fn(),
    onTogglePicked: jest.fn(),
    ...overrides,
  };
  const {renderer} = render(<PhotoFiltersSection {...props} />);
  return {props, renderer};
}

describe('PhotoFiltersSection', () => {
  it('labels rows with counts, 0 picked shows 0', () => {
    const {renderer} = setup();
    expect(getByLabel(renderer, 'All Photos, 635')).toBeTruthy();
    expect(getByLabel(renderer, 'Picked for Upload, 0')).toBeTruthy();
  });

  it('header is a button exposing expanded and toggles', () => {
    const {renderer, props} = setup({expanded: false});
    const header = getByLabel(renderer, 'Photo Filters');
    expect(header.props.accessibilityRole).toBe('button');
    expect(header.props.accessibilityState).toEqual({expanded: false});
    press(header);
    expect(props.onToggle).toHaveBeenCalledTimes(1);
  });

  it('hides rows when collapsed', () => {
    const {renderer} = setup({expanded: false});
    expect(
      renderer.root.findAllByProps({accessibilityLabel: 'All Photos, 635'}),
    ).toHaveLength(0);
  });

  it('All Photos selected only when no filter is active', () => {
    const none = setup();
    expect(
      getByLabel(none.renderer, 'All Photos, 635').props.accessibilityState
        .selected,
    ).toBe(true);
    const some = setup({hasActiveFilter: true});
    expect(
      getByLabel(some.renderer, 'All Photos, 635').props.accessibilityState
        .selected,
    ).toBe(false);
  });

  it('Picked for Upload selected when selectionFilter is selected', () => {
    const {renderer} = setup({
      selectionFilter: 'selected',
      hasActiveFilter: true,
      pickedCount: 148,
    });
    expect(
      getByLabel(renderer, 'Picked for Upload, 148').props.accessibilityState
        .selected,
    ).toBe(true);
  });

  it('fires row callbacks', () => {
    const {renderer, props} = setup();
    press(getByLabel(renderer, 'All Photos, 635'));
    press(getByLabel(renderer, 'Picked for Upload, 0'));
    expect(props.onShowAll).toHaveBeenCalledTimes(1);
    expect(props.onTogglePicked).toHaveBeenCalledTimes(1);
  });
});
