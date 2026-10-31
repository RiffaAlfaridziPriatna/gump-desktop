import React from 'react';
import {Text} from 'react-native';
import {SimilarShotsStrip} from '../../src/components/culling/SimilarShotsStrip';
import {getByLabel, press, render} from '../helpers/render';

const mockPhotos: Record<string, unknown> = {};
const mockUpdateSelection = jest.fn();
const mockGroupsHook = jest.fn();

jest.mock('@hooks/useSimilarShotGroups', () => ({
  useSimilarShotGroups: () => mockGroupsHook(),
}));
jest.mock('@context/culledAlbum', () => ({
  useCulledAlbumPhoto: (_albumId: string, photoId: string) =>
    mockPhotos[photoId],
}));
jest.mock('@lib/culling/cullingEngine', () => ({
  cullingEngine: {
    updateSelection: (...args: unknown[]) => mockUpdateSelection(...args),
  },
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
  });

  it('marks only the current photo', () => {
    const {view} = renderStrip('a');
    expect(
      getByLabel(view.renderer, 'Open IMG_1.jpg, current photo').props
        .accessibilityState.selected,
    ).toBe(true);
    expect(
      getByLabel(view.renderer, 'Open IMG_2.jpg').props.accessibilityState
        .selected,
    ).toBe(false);
  });

  it('opens the tapped photo', () => {
    const {view, onOpenPhoto} = renderStrip();
    press(getByLabel(view.renderer, 'Open IMG_2.jpg'));
    expect(onOpenPhoto).toHaveBeenCalledWith('b');
  });

  it('toggles pick through the selection action', () => {
    const {view} = renderStrip();
    press(getByLabel(view.renderer, 'Pick IMG_2.jpg, not picked'));
    expect(mockUpdateSelection).toHaveBeenCalledWith('album', 'b', {
      selected: true,
    });
    press(getByLabel(view.renderer, 'Unpick IMG_1.jpg, picked'));
    expect(mockUpdateSelection).toHaveBeenCalledWith('album', 'a', {
      selected: false,
    });
  });
});
