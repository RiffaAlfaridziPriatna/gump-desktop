import React from 'react';
import {FlatList, Text} from 'react-native';
import {CulledAlbumPhotoGrid} from '../../src/components/culling/CulledAlbumPhotoGrid';
import type {CulledAlbumGridSection} from '../../src/components/culling/culledAlbumGridRows';
import {render} from '../helpers/render';

jest.mock('../../src/components/culling/CulledAlbumPhotoCard', () => ({
  CulledAlbumPhotoCard: ({
    photoId,
    similarShotCount,
    isFocused,
    onCardPress,
  }: {
    photoId: string;
    similarShotCount?: number;
    isFocused?: boolean;
    onCardPress?: (photoId: string) => void;
  }) => {
    const {Text: T} = require('react-native');
    return (
      <T
        testID="card"
        similarShotCount={similarShotCount}
        isFocused={isFocused}
        onCardPress={onCardPress}>
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
const onCardPress = jest.fn();
const onClearFocus = jest.fn();
const photos = ['a0', 'a1', 'a2', 'a3', 'b0'].map(photoId => ({
  photoId,
  disabled: false,
}));

function grid(sections: CulledAlbumGridSection[], focusedPhotoId?: string) {
  return (
    <CulledAlbumPhotoGrid
      photos={photos}
      sections={sections}
      albumId="album"
      containerWidth={600}
      isMobileLayout
      canDeletePhoto={false}
      focusedPhotoId={focusedPhotoId}
      onCardPress={onCardPress}
      onClearFocus={onClearFocus}
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

describe('CulledAlbumPhotoGrid focus in grouped rows', () => {
  const sections: CulledAlbumGridSection[] = [
    {
      key: 'g1',
      title: 'Group 1',
      isGroup: true,
      photoIds: ['a0', 'a1', 'a2', 'a3'],
    },
    {key: 'other', title: 'Other matching photos', photoIds: ['b0']},
  ];

  it('marks only the focused grouped card and hands every card onCardPress', () => {
    const view = render(grid(sections, 'a1'));
    const cards = view.renderer.root.findAll(
      n => n.props.testID === 'card' && typeof n.type === 'string',
    );
    expect(cards.map(n => [n.props.children, !!n.props.isFocused])).toEqual([
      ['a0', false],
      ['a1', true],
      ['a2', false],
      ['a3', false],
      ['b0', false],
    ]);
    expect(cards.every(n => n.props.onCardPress === onCardPress)).toBe(true);
  });
});

describe('CulledAlbumPhotoGrid empty-area clear', () => {
  const sections: CulledAlbumGridSection[] = [
    {key: 'other', title: 'Other', photoIds: ['a0']},
  ];

  function findWrapper() {
    const view = render(grid(sections, 'a0'));
    const wrapper = view.renderer.root.find(
      n =>
        typeof n.type === 'string' &&
        typeof n.props.onResponderRelease === 'function',
    );
    return {view, wrapper};
  }

  beforeEach(() => onClearFocus.mockClear());

  it('clears focus on wrapper responder release', () => {
    const {wrapper} = findWrapper();
    expect(wrapper.props.onStartShouldSetResponder()).toBe(true);
    wrapper.props.onResponderRelease();
    expect(onClearFocus).toHaveBeenCalledTimes(1);
  });

  it('has no press handler, focusable or accessible surface', () => {
    const {wrapper} = findWrapper();
    expect(wrapper.props.onPress).toBeUndefined();
    expect(wrapper.props.focusable).toBeUndefined();
    expect(wrapper.props.accessible).toBe(false);
  });

  it('does not clear focus when a card is pressed', () => {
    const {view} = findWrapper();
    const card = view.renderer.root.find(
      n => n.props.testID === 'card' && typeof n.type === 'string',
    );
    card.props.onCardPress('a0');
    expect(onClearFocus).not.toHaveBeenCalled();
  });
});
