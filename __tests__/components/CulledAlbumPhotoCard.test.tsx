import React from 'react';
import {CulledAlbumPhotoCard} from '../../src/components/culling/CulledAlbumPhotoCard';
import {CulledAlbumPhotoFocusFrame} from '../../src/components/culling/CulledAlbumPhotoFocusFrame';
import {Pressable} from '../../src/components/ui';
import {getByLabel, render} from '../helpers/render';

jest.mock('@context/culledAlbum', () => ({
  useCulledAlbumPhoto: () => ({
    photoId: 'p1',
    file: {name: 'IMG_1.jpg'},
    analysisStatus: 'pending',
  }),
}));
jest.mock('@components/culling/CulledAlbumPhotoThumbnail', () => ({
  CulledAlbumPhotoThumbnail: () => null,
}));
jest.mock('@lib/storage/localStorage', () => ({
  resolveGridDisplayUri: () => 'file:///thumb.jpg',
}));
jest.mock('@lib/culledAlbum/photoHover', () => ({
  useCulledAlbumPhotoHovered: () => false,
  useCulledAlbumPhotoHoverStore: () => ({hoverIn: jest.fn(), hoverOut: jest.fn()}),
}));

function renderCard(similarShotCount?: number, isFocused = false) {
  const handlers = {
    onCardPress: jest.fn(),
    onOpenDetail: jest.fn(),
    onToggleSelection: jest.fn(),
    onDeletePress: jest.fn(),
    onStarPress: jest.fn(),
  };
  const view = render(
    <CulledAlbumPhotoCard
      albumId="album"
      photoId="p1"
      cardWidth={200}
      canDeletePhoto={false}
      isMobileLayout
      similarShotCount={similarShotCount}
      isFocused={isFocused}
      {...handlers}
    />,
  );
  return {view, ...handlers};
}

describe('CulledAlbumPhotoCard similar shots badge', () => {
  it('shows no badge without a count', () => {
    const {view} = renderCard();
    expect(
      view.renderer.root.findAllByProps({
        accessibilityLabel: '3 similar shots, open viewer',
      }),
    ).toHaveLength(0);
  });

  it('opens the viewer from the badge without selecting or starring', () => {
    const {view, onOpenDetail, onToggleSelection, onStarPress} = renderCard(3);
    const stopPropagation = jest.fn();
    getByLabel(view.renderer, '3 similar shots, open viewer').props.onPress({
      stopPropagation,
    });
    expect(stopPropagation).toHaveBeenCalled();
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
    expect(onOpenDetail).toHaveBeenCalledWith('p1');
    expect(onToggleSelection).not.toHaveBeenCalled();
    expect(onStarPress).not.toHaveBeenCalled();
  });

  it('frees the badge as its own accessible button; plain cards stay one element', () => {
    const grouped = renderCard(3).view.renderer.root;
    expect(grouped.findAllByType(Pressable)[0]?.props.accessible).toBe(false);
    expect(
      getByLabel(renderCard(3).view.renderer, '3 similar shots, open viewer').props
        .accessibilityRole,
    ).toBe('button');
    const plain = renderCard().view.renderer.root;
    expect(plain.findAllByType(Pressable)[0]?.props.accessible).toBe(true);
  });
});

describe('CulledAlbumPhotoCard focus', () => {
  it('exposes selected state and the focus frame only when focused', () => {
    const plain = renderCard().view.renderer.root;
    expect(plain.findAllByType(Pressable)[0]?.props.accessibilityState).toEqual({
      selected: false,
    });
    expect(plain.findAllByType(CulledAlbumPhotoFocusFrame)).toHaveLength(0);
    const focused = renderCard(undefined, true).view.renderer.root;
    expect(
      focused.findAllByType(Pressable)[0]?.props.accessibilityState,
    ).toEqual({selected: true});
    expect(focused.findAllByType(CulledAlbumPhotoFocusFrame)).toHaveLength(1);
  });

  it('routes a card press to onCardPress, not onOpenDetail', () => {
    const {view, onCardPress, onOpenDetail} = renderCard();
    view.renderer.root.findAllByType(Pressable)[0]?.props.onPress({
      nativeEvent: {locationX: 0, locationY: 0},
    });
    expect(onCardPress).toHaveBeenCalledWith('p1');
    expect(onOpenDetail).not.toHaveBeenCalled();
  });
});
