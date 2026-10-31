import React from 'react';
import {Text} from 'react-native';
import {SimilarShotsStrip} from '../../src/components/culling/SimilarShotsStrip';
import {getByLabel, press, render} from '../helpers/render';

const mockPhotos: Record<string, unknown> = {};
const mockToggle = jest.fn();
const mockReportError = jest.fn();
const mockGroupsHook = jest.fn();

jest.mock('@hooks/useSimilarShotGroups', () => ({
  useSimilarShotGroups: () => mockGroupsHook(),
}));
jest.mock('@context/culledAlbum', () => ({
  useCulledAlbumPhoto: (_albumId: string, photoId: string) =>
    mockPhotos[photoId],
}));
jest.mock('@lib/observability/reportError', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));
jest.mock('@components/culling/CulledAlbumPhotoThumbnail', () => ({
  CulledAlbumPhotoThumbnail: () => null,
}));
jest.mock('@lib/storage/localStorage', () => ({
  resolveGridDisplayUri: () => 'file:///thumb.jpg',
}));

function photo(name: string, extra: Record<string, unknown> = {}) {
  return {
    file: {name},
    selected: false,
    aiSelected: false,
    analysisStatus: 'analyzed',
    ...extra,
  };
}

function setGroup(photoIds: string[], shotCount = 2, pickedCount = 1) {
  mockGroupsHook.mockReturnValue({
    orderedGroups: [{groupId: 'g1', photoIds, bestPhotoId: photoIds[0]}],
    groupIndexByPhotoId: new Map(photoIds.map(id => [id, 0])),
    summaryFor: () => ({shotCount, pickedCount}),
  });
}

function renderStrip(photoId = 'a') {
  const onOpenPhoto = jest.fn();
  const view = render(
    <SimilarShotsStrip
      albumId="album"
      photoId={photoId}
      onOpenPhoto={onOpenPhoto}
      onToggleSelection={mockToggle}
    />,
  );
  return {view, onOpenPhoto};
}

function allText(view: ReturnType<typeof render>) {
  return view.renderer.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat()
    .join('|');
}

describe('SimilarShotsStrip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockToggle.mockResolvedValue(undefined);
    mockPhotos.a = photo('IMG_1.jpg', {selected: true, aiSelected: true});
    mockPhotos.b = photo('IMG_2.jpg');
    setGroup(['a', 'b']);
  });

  it('renders nothing when the photo is in no group', () => {
    mockGroupsHook.mockReturnValue({
      orderedGroups: [],
      groupIndexByPhotoId: new Map(),
      summaryFor: () => undefined,
    });
    const {view} = renderStrip();
    expect(view.renderer.toJSON()).toBeNull();
  });

  it('shows header counts and the AI recommended badge', () => {
    const {view} = renderStrip();
    const text = allText(view);
    expect(text).toContain('Similar shots · 2 photos · 1 picked');
    expect(text).toContain('AI recommended');
    const header = view.renderer.root.findByProps({accessibilityRole: 'header'});
    expect(header.props.accessibilityLabel).toBe(
      'Similar shots, 2 photos, 1 picked',
    );
  });

  it('exposes picked state as checked on the pick checkbox', () => {
    const {view} = renderStrip();
    expect(
      getByLabel(view.renderer, 'Pick IMG_1.jpg').props.accessibilityState,
    ).toEqual({checked: true, disabled: false});
    expect(
      getByLabel(view.renderer, 'Pick IMG_2.jpg').props.accessibilityRole,
    ).toBe('checkbox');
  });

  it('marks only the current photo', () => {
    const {view} = renderStrip('a');
    expect(
      getByLabel(view.renderer, 'Open IMG_1.jpg, picked, AI recommended, current photo').props
        .accessibilityState.selected,
    ).toBe(true);
    expect(
      getByLabel(view.renderer, 'Open IMG_2.jpg, not picked').props
        .accessibilityState.selected,
    ).toBe(false);
  });

  it('opens the tapped photo', () => {
    const {view, onOpenPhoto} = renderStrip();
    press(getByLabel(view.renderer, 'Open IMG_2.jpg, not picked'));
    expect(onOpenPhoto).toHaveBeenCalledWith('b');
  });

  it('toggles pick through the screen handler', () => {
    const {view} = renderStrip();
    press(getByLabel(view.renderer, 'Pick IMG_2.jpg'));
    expect(mockToggle).toHaveBeenCalledWith('b', true);
    press(getByLabel(view.renderer, 'Pick IMG_1.jpg'));
    expect(mockToggle).toHaveBeenCalledWith('a', false);
  });

  it('reports a rejected pick toggle instead of swallowing it', async () => {
    const failure = new Error('Cannot modify photos after upload');
    mockToggle.mockRejectedValue(failure);
    const {view} = renderStrip();
    press(getByLabel(view.renderer, 'Pick IMG_2.jpg'));
    await Promise.resolve();
    await Promise.resolve();
    expect(mockReportError).toHaveBeenCalledWith(failure, {
      source: 'similar_shots_strip',
      operation: 'toggle_pick',
    });
  });
});
