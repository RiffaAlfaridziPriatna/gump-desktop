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

  it('counts similar shots in +N behind a status badge', () => {
    const { renderer } = render(
      <PhotoAiBadges
        flags={{ ...none, aiSelected: true }}
        similarShotCount={3}
        onOpenDetail={jest.fn()}
      />,
    );
    expect(texts(renderer)).toEqual(['AI recommended', '+1']);
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
