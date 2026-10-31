import React from 'react';
import {FlatList, Text} from 'react-native';
import {CulledAlbumPhotoGrid} from '../../src/components/culling/CulledAlbumPhotoGrid';
import type {CulledAlbumGridSection} from '../../src/components/culling/culledAlbumGridRows';
import {render} from '../helpers/render';

jest.mock('../../src/components/culling/CulledAlbumPhotoCard', () => ({
  CulledAlbumPhotoCard: ({photoId}: {photoId: string}) => {
    const {Text: T} = require('react-native');
    return <T testID="card">{photoId}</T>;
  },
}));

// Store-backed side work is out of scope here; stub it at the module boundary.
jest.mock('@lib/culledAlbum/store', () => ({getPhotoById: () => undefined}));
jest.mock('@lib/culledAlbum/persistThumbnailDimensions', () => ({
  flushPendingThumbnailDimensions: jest.fn(),
}));
jest.mock('@lib/culledAlbum/thumbnailBackfill', () => ({
  scheduleThumbnailBackfillForPhotos: jest.fn(),
}));
jest.mock('@hooks/useVisiblePhotos', () => ({
  scheduleHydratePhotoIds: jest.fn(),
}));

const noop = jest.fn();
const photos = ['a0', 'a1', 'a2', 'a3', 'b0'].map(photoId => ({
  photoId,
  disabled: false,
}));

function grid(sections: CulledAlbumGridSection[]) {
  return (
    <CulledAlbumPhotoGrid
      photos={photos}
      sections={sections}
      albumId="album"
      containerWidth={600}
      isMobileLayout
      canDeletePhoto={false}
      onOpenDetail={noop}
      onToggleSelection={noop}
      onDeletePress={noop}
      onStarPress={noop}
    />
  );
}

describe('CulledAlbumPhotoGrid sections', () => {
  const sections: CulledAlbumGridSection[] = [
    {
      key: 'g1',
      title: 'Group 1',
      subtitle: '4 shots',
      isGroup: true,
      photoIds: ['a0', 'a1', 'a2', 'a3'],
    },
    {key: 'other', title: 'Other matching photos', photoIds: ['b0', 'missing']},
  ];

  it('renders headers with header role and unique row keys', () => {
    const {renderer} = render(grid(sections));
    const headers = renderer.root
      .findAllByType(Text)
      .filter(t => t.props.accessibilityRole === 'header');
    expect(headers.map(h => h.props.children)).toEqual([
      'Group 1 · 4 shots',
      'Other matching photos',
    ]);
    const keys = renderer.root
      .findByType(FlatList)
      .props.data.map((r: {key: string}) => r.key);
    expect(keys).toHaveLength(5);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps row objects identical when only header text changes', () => {
    const view = render(grid(sections));
    const before = view.renderer.root.findByType(FlatList).props.data;
    view.rerender(grid(sections.map(s => ({...s, title: `${s.title}!`}))));
    expect(view.renderer.root.findByType(FlatList).props.data).toBe(before);
  });
});
