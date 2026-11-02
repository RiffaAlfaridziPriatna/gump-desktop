import React from 'react';
import {AiCategoriesSection} from '../../src/components/culling/AiCategoriesSection';
import {getAllByRole, getByLabel, press, render} from '../helpers/render';

function setup() {
  const onToggleFilter = jest.fn();
  const {renderer} = render(
    <AiCategoriesSection
      activeFilters={{
        aiSelected: true,
        maybe: false,
        blurred: false,
        closedEyes: false,
        duplicated: false,
      }}
      filterCounts={{
        aiSelected: 61,
        maybe: 92,
        blurred: 2,
        closedEyes: 120,
        duplicated: 349,
      }}
      onToggleFilter={onToggleFilter}
    />,
  );
  return {renderer, onToggleFilter};
}

describe('AiCategoriesSection', () => {
  it('renders five rows in order with count labels', () => {
    const {renderer} = setup();
    // Pressable wrapper forwards props to nested nodes; dedupe by label.
    const labels = getAllByRole(renderer, 'checkbox').map(
      n => n.props.accessibilityLabel,
    );
    expect([...new Set(labels)]).toEqual([
      'AI Recommended, 61',
      'Needs Review, 92',
      'Possible Blur, 2',
      'Possible Closed Eyes, 120',
      'Similar Shots, 349',
    ]);
  });

  it('exposes checked state', () => {
    const {renderer} = setup();
    expect(
      getByLabel(renderer, 'AI Recommended, 61').props.accessibilityState
        .checked,
    ).toBe(true);
    expect(
      getByLabel(renderer, 'Needs Review, 92').props.accessibilityState.checked,
    ).toBe(false);
  });

  it('toggles the pressed key', () => {
    const {renderer, onToggleFilter} = setup();
    press(getByLabel(renderer, 'Possible Blur, 2'));
    expect(onToggleFilter).toHaveBeenCalledWith('blurred');
  });
});
