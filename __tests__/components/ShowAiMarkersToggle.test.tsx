import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {
  SHOW_AI_MARKERS_LABEL,
  ShowAiMarkersToggle,
} from '../../src/components/culling/ShowAiMarkersToggle';
import {colors} from '../../src/lib/ui/colors';
import {fonts} from '../../src/lib/ui/typography';
import {getByLabel, press, render} from '../helpers/render';

const flat = (node: {props: {style?: unknown}}) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<
    string,
    unknown
  >;

describe('ShowAiMarkersToggle', () => {
  it('renders the Figma switch sizes and label', () => {
    const onChange = jest.fn();
    const {renderer} = render(
      <ShowAiMarkersToggle value onChange={onChange} />,
    );
    const control = getByLabel(renderer, SHOW_AI_MARKERS_LABEL);
    expect(control.props.accessibilityRole).toBe('switch');
    expect(control.props.accessibilityState).toEqual({checked: true});
    expect(
      renderer.root.findAllByType(Text).map(t => t.props.children),
    ).toContain(SHOW_AI_MARKERS_LABEL);
    const track = renderer.root
      .findAllByType(View)
      .find(v => flat(v).width === 36 && flat(v).height === 20)!;
    expect(flat(track)).toMatchObject({
      backgroundColor: colors.accent,
      borderRadius: 100,
    });
    expect(flat(renderer.root.findAllByType(Text)[0])).toMatchObject({
      fontFamily: fonts.sans,
      fontSize: 14,
      color: colors.white,
    });
  });

  it('toggles off and reports the next value', () => {
    const onChange = jest.fn();
    const {renderer} = render(
      <ShowAiMarkersToggle value onChange={onChange} />,
    );
    press(getByLabel(renderer, SHOW_AI_MARKERS_LABEL));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('shows the idle track when off', () => {
    const {renderer} = render(
      <ShowAiMarkersToggle value={false} onChange={jest.fn()} />,
    );
    const track = renderer.root
      .findAllByType(View)
      .find(v => flat(v).width === 36 && flat(v).height === 20)!;
    expect(flat(track)).toMatchObject({
      backgroundColor: colors.fabBackground,
    });
  });
});
