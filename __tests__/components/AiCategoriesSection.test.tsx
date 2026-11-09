import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors} from '../../src/lib/ui/colors';
import {fonts} from '../../src/lib/ui/typography';
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

describe('AiCategoriesSection Figma values', () => {
  it('caption is Red Hat Display SemiBold 16 white, 4 above the rows', () => {
    const {renderer} = setup();
    const caption = renderer.root
      .findAllByType(Text)
      .find(t => t.props.children === 'AI Categories')!;
    expect(StyleSheet.flatten(caption.props.style)).toMatchObject({
      fontFamily: fonts.sansSemiBold,
      fontSize: 16,
      color: colors.white,
      paddingBottom: 4,
    });
    expect(
      StyleSheet.flatten(renderer.root.findAllByType(View)[0]!.props.style).gap,
    ).toBe(4);
  });

  it('category icons use the Figma stroke gray', () => {
    const {renderer} = setup();
    const icons = renderer.root.findAll(
      n => n.type === ('SvgMock' as never) && n.props.width === 14,
    );
    expect(icons).toHaveLength(5);
    icons.forEach(i => expect(i.props.color).toBe(colors.textGray));
  });

  it('checked box shows a 12px white check', () => {
    const {renderer} = setup();
    const checks = renderer.root.findAll(
      n => n.type === ('SvgMock' as never) && n.props.width === 12,
    );
    expect(checks).toHaveLength(1);
    expect(checks[0]!.props).toMatchObject({height: 12, color: colors.white});
  });
});
