import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {
  PhotoDetailHeader,
  PICKED_LABEL,
  PICK_LABEL,
} from '../../src/components/culling/PhotoDetailHeader';
import {fonts} from '../../src/lib/ui/typography';
import {getByLabel, press, render} from '../helpers/render';

const flat = (node: {props: {style?: unknown}}) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<
    string,
    unknown
  >;

function renderHeader(picked = false, disabled = false) {
  const onTogglePick = jest.fn();
  const onRate = jest.fn();
  const view = render(
    <PhotoDetailHeader
      fileName="SO5_7334.JPG"
      starRating={2}
      picked={picked}
      disabled={disabled}
      isMobileLayout={false}
      paddingHorizontal={64}
      onRate={onRate}
      onTogglePick={onTogglePick}
      onClose={jest.fn()}
    />,
  );
  return {view, onTogglePick, onRate};
}

const textNode = (view: ReturnType<typeof render>, value: string) =>
  view.renderer.root
    .findAllByType(Text)
    .find(node => node.props.children === value)!;

describe('PhotoDetailHeader', () => {
  it('styles the header row 40/40 with horizontal 64', () => {
    const {view} = renderHeader();
    const header = view.renderer.root.findAllByType(View)[0];
    expect(flat(header)).toMatchObject({
      paddingVertical: 40,
      paddingHorizontal: 64,
    });
  });

  it('shows the file name in Red Hat Display SemiBold 20', () => {
    const {view} = renderHeader();
    expect(flat(textNode(view, 'SO5_7334.JPG'))).toMatchObject({
      fontFamily: fonts.sansSemiBold,
      fontSize: 20,
    });
  });

  it('lays stars out 24 wide with gap 4', () => {
    const {view} = renderHeader();
    const star = getByLabel(view.renderer, 'Rate 1 stars');
    expect(flat(star)).toMatchObject({width: 24, height: 24});
    const row = view.renderer.root
      .findAllByType(View)
      .find(n => flat(n).gap === 4 && flat(n).flexDirection === 'row');
    expect(row).toBeDefined();
  });

  it('draws the pick pill: border, radius, padding, gap, 20 circle', () => {
    const {view} = renderHeader();
    const pill = getByLabel(view.renderer, PICK_LABEL);
    expect(flat(pill)).toMatchObject({
      borderWidth: 1,
      borderColor: '#4A4A4A',
      borderRadius: 100,
      paddingHorizontal: 14,
      paddingVertical: 8,
      gap: 8,
    });
    expect(flat(textNode(view, PICK_LABEL))).toMatchObject({
      fontFamily: fonts.interSemiBold,
      fontSize: 14,
      color: '#FFFFFF',
    });
    const circle = view.renderer.root
      .findAllByType(View)
      .find(n => flat(n).width === 20 && flat(n).borderRadius === 10)!;
    expect(flat(circle)).toMatchObject({borderWidth: 1.5});
  });

  it('shows Picked with selected state and toggles on press', () => {
    const {view, onTogglePick} = renderHeader(true);
    const pill = getByLabel(view.renderer, PICKED_LABEL);
    expect(pill.props.accessibilityRole).toBe('button');
    expect(pill.props.accessibilityState).toEqual({
      selected: true,
      disabled: false,
    });
    expect(textNode(view, PICKED_LABEL)).toBeDefined();
    press(pill);
    expect(onTogglePick).toHaveBeenCalledTimes(1);
  });

  it('exposes unpicked as not selected and ignores press when disabled', () => {
    const {view, onTogglePick} = renderHeader(false, true);
    const pill = getByLabel(view.renderer, PICK_LABEL);
    expect(pill.props.accessibilityState).toEqual({
      selected: false,
      disabled: true,
    });
    press(pill);
    expect(onTogglePick).not.toHaveBeenCalled();
  });

  it('rates by index', () => {
    const {view, onRate} = renderHeader();
    press(getByLabel(view.renderer, 'Rate 3 stars'));
    expect(onRate).toHaveBeenCalledWith(2);
  });
});
