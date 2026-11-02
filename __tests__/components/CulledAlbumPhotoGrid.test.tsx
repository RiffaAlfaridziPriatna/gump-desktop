import React from 'react';
import {FlatList, Text} from 'react-native';
import {CulledAlbumPhotoGrid} from '../../src/components/culling/CulledAlbumPhotoGrid';
import type {CulledAlbumGridSection} from '../../src/components/culling/culledAlbumGridRows';
import {render} from '../helpers/render';

jest.mock('../../src/components/culling/CulledAlbumPhotoCard', () => ({
  CulledAlbumPhotoCard: ({
    photoId,
    similarShotCount,
  }: {
    photoId: string;
    similarShotCount?: number;
  }) => {
    const {Text: T} = require('react-native');
    return (
      <T testID="card" similarShotCount={similarShotCount}>
        {photoId}
      </T>
    );
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
      onCardPress={noop}
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

describe('CulledAlbumPhotoGrid similar shot counts', () => {
  const flat = (getSimilarShotCount?: (photoId: string) => number | undefined) => (
    <CulledAlbumPhotoGrid
      photos={photos}
      albumId="album"
      containerWidth={600}
      isMobileLayout
      canDeletePhoto={false}
      getSimilarShotCount={getSimilarShotCount}
      onCardPress={noop}
      onOpenDetail={noop}
      onToggleSelection={noop}
      onDeletePress={noop}
      onStarPress={noop}
    />
  );
  const countsByCard = (view: ReturnType<typeof render>) =>
    Object.fromEntries(
      view.renderer.root
        .findAll(n => n.props.testID === 'card' && typeof n.type === 'string')
        .map(n => [n.props.children, n.props.similarShotCount]),
    );

  it('hands each card its own count as a primitive', () => {
    const view = render(flat(id => (id.startsWith('a') ? 4 : undefined)));
    expect(countsByCard(view)).toEqual({
      a0: 4,
      a1: 4,
      a2: 4,
      a3: 4,
      b0: undefined,
    });
  });

  it('passes no counts when the getter is absent', () => {
    const view = render(flat());
    expect(Object.values(countsByCard(view)).every(c => c === undefined)).toBe(true);
  });
});
