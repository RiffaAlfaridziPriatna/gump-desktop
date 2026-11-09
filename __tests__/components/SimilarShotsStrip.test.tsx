import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {SimilarShotsStrip} from '../../src/components/culling/SimilarShotsStrip';
import {fonts} from '../../src/lib/ui/typography';
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

  describe('figma styles', () => {
    type Styled = {props: {style?: unknown}};
    const flat = (node: Styled) =>
      (StyleSheet.flatten(node.props.style as never) ?? {}) as Record<string, unknown>;
    const views = (view: ReturnType<typeof render>) =>
      view.renderer.root.findAllByType(View);
    const viewsWith = (
      view: ReturnType<typeof render>,
      match: Record<string, unknown>,
    ) =>
      views(view).filter(node => {
        const style = flat(node);
        return Object.entries(match).every(([k, v]) => style[k] === v);
      });
    const textNode = (view: ReturnType<typeof render>, value: string) =>
      view.renderer.root
        .findAllByType(Text)
        .find(node => node.props.children === value)!;

    it('styles the title row, cards and filename', () => {
      const {view} = renderStrip();
      const title = view.renderer.root.findByProps({accessibilityRole: 'header'});
      expect(flat(title)).toMatchObject({
        fontFamily: fonts.interSemiBold,
        fontSize: 14,
        color: '#FFFFFF',
      });
      expect(viewsWith(view, {gap: 10, paddingTop: 28})).toHaveLength(1);
      expect(viewsWith(view, {flexDirection: 'row', gap: 8})).toHaveLength(1);
      const cards = viewsWith(view, {
        width: 140,
        padding: 1,
        borderWidth: 2,
        borderRadius: 8,
        gap: 6,
      });
      expect(cards).toHaveLength(2);
      expect(
        viewsWith(view, {width: 134, height: 89, borderRadius: 6}),
      ).toHaveLength(2);
      expect(
        viewsWith(view, {flexDirection: 'row', gap: 4, height: 24}),
      ).toHaveLength(2);
      expect(flat(textNode(view, 'IMG_2.jpg'))).toMatchObject({
        fontFamily: fonts.sans,
        fontSize: 11,
        color: '#FFFFFF',
      });
    });

    it('draws the blue border only on the current card', () => {
      const {view} = renderStrip('a');
      expect(viewsWith(view, {width: 140, borderColor: '#4141FF'})).toHaveLength(1);
      expect(
        viewsWith(view, {width: 140, borderColor: 'transparent'}),
      ).toHaveLength(1);
      const current = viewsWith(view, {width: 140, borderColor: '#4141FF'})[0];
      expect(
        current.findAll(
          n => n.props.accessibilityLabel === 'Pick IMG_1.jpg',
        ).length,
      ).toBeGreaterThan(0);
    });

    it('styles the pick control for picked and unpicked', () => {
      const {view} = renderStrip();
      expect(
        viewsWith(view, {
          width: 18,
          height: 18,
          borderRadius: 9,
          borderWidth: 1.5,
          borderColor: '#FFFFFF',
        }),
      ).toHaveLength(1);
      expect(
        viewsWith(view, {
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: '#FF9632',
          borderWidth: 0,
        }),
      ).toHaveLength(1);
      expect(viewsWith(view, {width: 24, height: 24})).toHaveLength(2);
    });

    it('shows the AI badge on blue with icon and text', () => {
      const {view} = renderStrip();
      expect(flat(textNode(view, 'AI recommended'))).toMatchObject({
        fontFamily: fonts.interSemiBold,
        fontSize: 12,
        color: '#FFFFFF',
      });
      const [badge] = viewsWith(view, {
        backgroundColor: '#4141FF',
        borderRadius: 100,
        paddingHorizontal: 8,
        paddingVertical: 4,
        gap: 4,
        left: 4,
        bottom: 4,
      });
      expect(badge).toBeDefined();
      expect(
        badge.findAll(n => (n.type as unknown as string) === 'SvgMock'),
      ).toHaveLength(1);
    });
  });

  it('makes the pick control focusable for keyboard use and announces state', () => {
    const {view} = renderStrip();
    const pick = getByLabel(view.renderer, 'Pick IMG_2.jpg');
    expect(pick.props.focusable).toBe(true);
    expect(pick.props.accessibilityRole).toBe('checkbox');
    expect(pick.props.accessibilityState).toEqual({
      checked: false,
      disabled: false,
    });
  });
});
