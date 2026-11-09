import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {FaceStatusIconBadge} from '../../src/components/culling/FaceStatusIconBadge';
import {FaceStatusTooltip} from '../../src/components/culling/FaceStatusTooltip';
import type {FaceStatusMeta} from '../../src/lib/culling/faceStatus';
import {render} from '../helpers/render';

const Icon = (_props: {width?: number; height?: number}) => null;
const meta = (label: string): FaceStatusMeta => ({
  Icon,
  label,
  color: '#41B437',
});

const flat = (node: {props: {style?: unknown}}) =>
  (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<
    string,
    unknown
  >;

describe('FaceStatusIconBadge', () => {
  it('large badge is a 32 circle with a 20 eyes icon override', () => {
    const {renderer} = render(
      <FaceStatusIconBadge meta={meta('Open Eyes')} size="large" iconSize={20} />,
    );
    const circle = renderer.root
      .findAllByType(View)
      .find(n => flat(n).borderRadius === 16)!;
    expect(flat(circle)).toMatchObject({width: 32, height: 32});
    expect(renderer.root.findByType(Icon).props).toMatchObject({
      width: 20,
      height: 20,
    });
  });

  it('large badge defaults to a 16 icon', () => {
    const {renderer} = render(
      <FaceStatusIconBadge meta={meta('Good Focus')} size="large" />,
    );
    expect(renderer.root.findByType(Icon).props).toMatchObject({
      width: 16,
      height: 16,
    });
  });
});

describe('FaceStatusTooltip', () => {
  it('uses gap 8 between lines, 4 icon to text and lineHeight 10', () => {
    const {renderer} = render(
      <FaceStatusTooltip
        eyeMeta={meta('Open Eyes')}
        focusMeta={meta('Good Focus')}
      />,
    );
    const views = renderer.root.findAllByType(View);
    expect(views.some(n => flat(n).gap === 8)).toBe(true);
    expect(
      views.filter(n => flat(n).gap === 4 && flat(n).flexDirection === 'row'),
    ).toHaveLength(2);
    const label = renderer.root
      .findAllByType(Text)
      .find(n => n.props.children === 'Open Eyes')!;
    expect(flat(label)).toMatchObject({fontSize: 10, lineHeight: 10});
  });
});
