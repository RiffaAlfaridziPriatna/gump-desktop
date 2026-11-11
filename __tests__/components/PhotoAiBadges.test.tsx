import React from 'react';
import { StyleSheet, Text } from 'react-native';
import {
  PhotoAiBadges,
  listPhotoBadges,
} from '../../src/components/culling/PhotoAiBadges';
import { fonts } from '../../src/lib/ui/typography';
import { render } from '../helpers/render';

const none = {
  aiSelected: false,
  maybe: false,
  closedEyes: false,
  blurred: false,
};
const texts = (r: ReturnType<typeof render>['renderer']) =>
  r.root.findAllByType(Text).map(t => t.props.children);

describe('PhotoAiBadges', () => {
  it('orders ai, maybe, eyes, sharpness', () => {
    const all = {
      aiSelected: true,
      maybe: true,
      closedEyes: true,
      blurred: true,
    };
    expect(listPhotoBadges(all).map(b => b.label)).toEqual([
      'AI recommended',
      'Needs review',
      'Check eyes',
      'Check sharpness',
    ]);
  });

  it('renders nothing for an unflagged photo without a group', () => {
    const { renderer } = render(
      <PhotoAiBadges flags={none} onOpenDetail={jest.fn()} />,
    );
    expect(texts(renderer)).toEqual([]);
  });

  it('shows closed eyes first and collapses blurred into +1', () => {
    const { renderer } = render(
      <PhotoAiBadges
        flags={{ ...none, closedEyes: true, blurred: true }}
        onOpenDetail={jest.fn()}
      />,
    );
    expect(texts(renderer)).toEqual(['Check eyes', '+1']);
  });

  it('gives every chip a non-empty accessibilityLabel', () => {
    const { renderer } = render(
      <PhotoAiBadges
        flags={{ ...none, closedEyes: true, blurred: true }}
        onOpenDetail={jest.fn()}
      />,
    );
    const chips = renderer.root.findAll(
      n => typeof n.type === 'string' && n.props.accessible === true,
    );
    expect(chips.length).toBe(2);
    chips.forEach(c => expect(c.props.accessibilityLabel).toBeTruthy());
    expect(chips[1].props.accessibilityLabel).toBe('1 more: Check sharpness');
  });

  it('makes +N open the viewer without the card press when grouped', () => {
    const onOpenDetail = jest.fn();
    const stopPropagation = jest.fn();
    const { renderer } = render(
      <PhotoAiBadges
        flags={{ ...none, aiSelected: true }}
        similarShotCount={3}
        onOpenDetail={onOpenDetail}
      />,
    );
    expect(texts(renderer)).toEqual(['AI recommended', '+1']);
    const btn = renderer.root.find(
      n => n.props.accessibilityRole === 'button' && n.props.onPress,
    );
    expect(btn.props.accessibilityLabel).toBe(
      '1 more: 3 similar shots, open viewer',
    );
    btn.props.onPress({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalled();
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
  });

  it('falls back to the similar shots button alone', () => {
    const { renderer } = render(
      <PhotoAiBadges
        flags={none}
        similarShotCount={3}
        onOpenDetail={jest.fn()}
      />,
    );
    expect(texts(renderer)).toEqual(['3 similar shots']);
  });

  it('matches the Figma chip: offsets, height, Inter SemiBold, alpha, 12 icon', () => {
    const { renderer } = render(
      <PhotoAiBadges
        flags={{ ...none, closedEyes: true, blurred: true }}
        onOpenDetail={jest.fn()}
      />,
    );
    const row = StyleSheet.flatten(
      renderer.root.find(n => n.props.pointerEvents === 'box-none').props.style,
    );
    expect(row).toMatchObject({ left: 8, bottom: 8, gap: 4 });
    const chips = renderer.root.findAll(
      n => typeof n.type === 'string' && n.props.accessible === true,
    );
    chips.forEach(c =>
      expect(StyleSheet.flatten(c.props.style)).toMatchObject({
        height: 23,
        paddingHorizontal: 8,
        gap: 4,
        backgroundColor: 'rgba(19,20,21,0.75)',
      }),
    );
    renderer.root.findAllByType(Text).forEach(t =>
      expect(StyleSheet.flatten(t.props.style)).toMatchObject({
        fontFamily: fonts.interSemiBold,
        fontSize: 12,
      }),
    );
    const icon = renderer.root.find(n => n.props.accessible === false && n.props.source);
    expect(StyleSheet.flatten(icon.props.style)).toMatchObject({ width: 12, height: 12 });
  });

  it('keeps the AI recommended chip blue', () => {
    const { renderer } = render(
      <PhotoAiBadges flags={{ ...none, aiSelected: true }} onOpenDetail={jest.fn()} />,
    );
    const chip = renderer.root.find(
      n => typeof n.type === 'string' && n.props.accessibilityLabel === 'AI recommended',
    );
    expect(StyleSheet.flatten(chip.props.style).backgroundColor).toBe('#4141FF');
  });
});
