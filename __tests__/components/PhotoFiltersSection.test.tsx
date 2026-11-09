import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors} from '../../src/lib/ui/colors';
import {fonts} from '../../src/lib/ui/typography';
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

describe('PhotoFiltersSection Figma values', () => {
  const flat = (n: {props: {style?: unknown}}) =>
    StyleSheet.flatten(n.props.style as never);
  const textStyle = (
    renderer: ReturnType<typeof setup>['renderer'],
    text: string,
  ) =>
    flat(
      renderer.root.findAllByType(Text).find(t => t.props.children === text)!,
    );
  const icons = (renderer: ReturnType<typeof setup>['renderer']) =>
    renderer.root.findAll(n => n.type === ('SvgMock' as never));

  it('heading is Inter SemiBold 16 white with an 8 gap to the rows', () => {
    const {renderer} = setup();
    expect(textStyle(renderer, 'Photo Filters')).toMatchObject({
      fontFamily: fonts.interSemiBold,
      fontSize: 16,
      color: colors.white,
    });
    expect(flat(renderer.root.findAllByType(View)[0]!).gap).toBe(8);
  });

  it('selected row label is Inter SemiBold 14 white, the other stays Regular', () => {
    const {renderer} = setup({
      selectionFilter: 'selected',
      hasActiveFilter: true,
    });
    expect(textStyle(renderer, 'Picked for Upload')).toMatchObject({
      fontFamily: fonts.interSemiBold,
      fontSize: 14,
      color: colors.white,
    });
    expect(textStyle(renderer, 'All Photos')).toMatchObject({
      fontFamily: fonts.sans,
      fontSize: 14,
    });
  });

  it.each([
    ['All Photos selected', {}],
    ['Picked selected', {selectionFilter: 'selected', hasActiveFilter: true}],
  ] as const)('circle-check is orange and layout-grid white: %s', (_n, o) => {
    const {renderer} = setup(o);
    const colorsOf = icons(renderer).map(i => i.props.color);
    expect(colorsOf).toEqual([
      colors.white,
      colors.white,
      colors.white,
      colors.accent,
    ]);
  });
});
