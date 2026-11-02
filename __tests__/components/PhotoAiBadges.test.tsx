import React from 'react';
import { Text } from 'react-native';
import {
  PhotoAiBadges,
  listPhotoBadges,
} from '../../src/components/culling/PhotoAiBadges';
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
    expect(texts(renderer)).toEqual(['3 similar shots ›']);
  });
});
