import React from 'react';
import {CulledAlbumPhotoCard} from '../../src/components/culling/CulledAlbumPhotoCard';
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

function renderCard(similarShotCount?: number) {
  const handlers = {
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
});
