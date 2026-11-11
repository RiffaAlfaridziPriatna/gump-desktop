import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import {CulledAlbumPhotoCard} from '../../src/components/culling/CulledAlbumPhotoCard';
import {CulledAlbumPhotoFocusFrame} from '../../src/components/culling/CulledAlbumPhotoFocusFrame';
import {Pressable} from '../../src/components/ui';
import {colors} from '../../src/lib/ui/colors';
import {getByLabel, render} from '../helpers/render';

let mockPhoto: Record<string, unknown> = {
  photoId: 'p1',
  file: {name: 'IMG_1.jpg'},
  analysisStatus: 'pending',
};
jest.mock('@context/culledAlbum', () => ({
  useCulledAlbumPhoto: () => mockPhoto,
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
    const {view, onCardPress, onOpenDetail, onToggleSelection, onStarPress} =
      renderCard(3);
    const stopPropagation = jest.fn();
    getByLabel(view.renderer, '3 similar shots, open viewer').props.onPress({
      stopPropagation,
    });
    expect(stopPropagation).toHaveBeenCalled();
    expect(onOpenDetail).toHaveBeenCalledTimes(1);
    expect(onOpenDetail).toHaveBeenCalledWith('p1');
    expect(onCardPress).not.toHaveBeenCalled();
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

  it('keeps AI badges reachable: badged card is not an accessible group', () => {
    mockPhoto = {...mockPhoto, aiSelected: true, closedEyes: true};
    const {view} = renderCard();
    expect(view.renderer.root.findAllByType(Pressable)[0]?.props.accessible).toBe(false);
    expect(getByLabel(view.renderer, 'AI recommended')).toBeTruthy();
    mockPhoto = {photoId: 'p1', file: {name: 'IMG_1.jpg'}, analysisStatus: 'pending'};
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

describe('CulledAlbumPhotoCard chrome taps keep focus untouched', () => {
  const STAR_FRAME = {x: 0, y: 200, width: 96, height: 16};
  const SELECT_FRAME = {x: 100, y: 200, width: 28, height: 28};

  beforeEach(() => {
    jest
      .spyOn(View.prototype, 'measureInWindow')
      .mockImplementation(function (
        this: {props: {style?: unknown}},
        cb: (x: number, y: number, w: number, h: number) => void,
      ) {
        const style = ([] as {width?: number}[])
          .concat(this.props.style as never)
          .find(st => st?.width != null);
        const f = style?.width === 96 ? STAR_FRAME : SELECT_FRAME;
        cb(f.x, f.y, f.width, f.height);
      });
    mockPhoto = {
      photoId: 'p1',
      file: {name: 'IMG_1.jpg'},
      analysisStatus: 'analyzed',
      selected: false,
      starRating: 2,
      faces: [],
    };
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => {
    mockPhoto = {
      photoId: 'p1',
      file: {name: 'IMG_1.jpg'},
      analysisStatus: 'pending',
    };
  });

  // The jest View mock has no layout; stub window frames per view (star row width 96, pick circle otherwise).
  function renderAnalyzed(canDeletePhoto = false) {
    const handlers = {
      onCardPress: jest.fn(),
      onOpenDetail: jest.fn(),
      onToggleSelection: jest.fn(),
      onDeletePress: jest.fn(),
      onStarPress: jest.fn(),
    };
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <CulledAlbumPhotoCard
          albumId="album"
          photoId="p1"
          cardWidth={200}
          canDeletePhoto={canDeletePhoto}
          isMobileLayout
          {...handlers}
        />,
      );
    });
    const pressAt = (pageX: number, pageY: number) =>
      renderer.root.findAllByType(Pressable)[0]?.props.onPress({
        nativeEvent: {locationX: 0, locationY: 0, pageX, pageY},
      });
    return {renderer, pressAt, ...handlers};
  }

  it('pick circle tap toggles selection and does not call onCardPress', () => {
    const {pressAt, onCardPress, onToggleSelection} = renderAnalyzed();
    pressAt(114, 214);
    expect(onToggleSelection).toHaveBeenCalledWith('p1', true);
    expect(onCardPress).not.toHaveBeenCalled();
  });

  it('star tap rates and does not call onCardPress', () => {
    const {pressAt, onCardPress, onStarPress} = renderAnalyzed();
    pressAt(45, 208);
    expect(onStarPress).toHaveBeenCalledWith('p1', 2, 2);
    expect(onCardPress).not.toHaveBeenCalled();
  });

  it('delete tap deletes and does not call onCardPress', () => {
    const {renderer, onCardPress, onDeletePress} = renderAnalyzed(true);
    const stopPropagation = jest.fn();
    getByLabel(renderer, 'Delete IMG_1.jpg').props.onPress({stopPropagation});
    expect(stopPropagation).toHaveBeenCalled();
    expect(onDeletePress).toHaveBeenCalledWith('p1', 'IMG_1.jpg');
    expect(onCardPress).not.toHaveBeenCalled();
  });

  it('a tap outside the chrome does focus the card', () => {
    const {pressAt, onCardPress, onToggleSelection, onStarPress} = renderAnalyzed();
    pressAt(50, 50);
    expect(onCardPress).toHaveBeenCalledWith('p1');
    expect(onToggleSelection).not.toHaveBeenCalled();
    expect(onStarPress).not.toHaveBeenCalled();
  });
});

describe('CulledAlbumPhotoCard Figma shell and footer', () => {
  const flat = (node: TestRenderer.ReactTestInstance) =>
    StyleSheet.flatten(node.props.style) ?? {};
  const rootOf = (analyzed: boolean) => {
    mockPhoto = {
      photoId: 'p1',
      file: {name: 'IMG_1.jpg'},
      analysisStatus: analyzed ? 'analyzed' : 'pending',
      selected: analyzed,
      starRating: 2,
      faces: [],
    };
    const {view} = renderCard(undefined, true);
    const root = view.renderer.root;
    const label = root.findByType(Text);
    const footer = label.parent as TestRenderer.ReactTestInstance;
    const card = root.findAllByType(View).find(
      v => flat(v).backgroundColor === colors.photoCardBackground,
    ) as TestRenderer.ReactTestInstance;
    return {root, label, footer, card};
  };
  afterEach(() => {
    mockPhoto = {photoId: 'p1', file: {name: 'IMG_1.jpg'}, analysisStatus: 'pending'};
  });

  it('card shell: background, radius, padding, gap', () => {
    const {card} = rootOf(false);
    expect(flat(card)).toMatchObject({
      backgroundColor: '#161718',
      borderRadius: 6,
      paddingTop: 8,
      paddingHorizontal: 8,
      paddingBottom: 12,
      gap: 8,
    });
  });

  it('footer: height 28, gap 4, padding right 2, order pick, name, stars', () => {
    const {footer, label} = rootOf(false);
    expect(flat(footer)).toMatchObject({height: 28, gap: 4, paddingRight: 2});
    const kids = footer.children as TestRenderer.ReactTestInstance[];
    expect(kids[1]).toBe(label);
    expect(flat(kids[0])).toMatchObject({width: 28, height: 28});
    expect(flat(kids[2].findAllByType(View)[0])).toMatchObject({width: 96, height: 16});
    expect(flat(label)).toMatchObject({fontSize: 14, color: colors.text});
  });

  it('pick control: empty is a 1px white ring, picked is filled orange', () => {
    const empty = rootOf(false).footer.children[0] as TestRenderer.ReactTestInstance;
    const emptyCircle = empty.findAllByType(View).find(v => flat(v).width === 20);
    expect(flat(emptyCircle as TestRenderer.ReactTestInstance)).toMatchObject({
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.white,
    });
    const picked = rootOf(true).footer.children[0] as TestRenderer.ReactTestInstance;
    const pickedCircle = picked.findAllByType(View).find(v => flat(v).width === 20);
    expect(flat(pickedCircle as TestRenderer.ReactTestInstance)).toMatchObject({
      backgroundColor: '#FF9632',
    });
    expect(flat(pickedCircle as TestRenderer.ReactTestInstance).borderWidth).toBeUndefined();
  });

  it('focus frame sits on the card bounds, 2px blue, radius 6', () => {
    const {card} = rootOf(false);
    const frame = card.findByType(CulledAlbumPhotoFocusFrame).findByType(View);
    expect(flat(frame)).toMatchObject({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      borderWidth: 2,
      borderRadius: 6,
      borderColor: '#4141FF',
    });
  });

  it('delete button: 36 circle, top 12, right 11.67, label kept', () => {
    mockPhoto = {
      photoId: 'p1',
      file: {name: 'IMG_1.jpg'},
      analysisStatus: 'analyzed',
      selected: false,
      starRating: 0,
      faces: [],
    };
    const view = render(
      <CulledAlbumPhotoCard
        albumId="album"
        photoId="p1"
        cardWidth={200}
        canDeletePhoto
        isMobileLayout
        onCardPress={jest.fn()}
        onOpenDetail={jest.fn()}
        onToggleSelection={jest.fn()}
        onDeletePress={jest.fn()}
        onStarPress={jest.fn()}
      />,
    );
    const del = getByLabel(view.renderer, 'Delete IMG_1.jpg');
    expect(StyleSheet.flatten(del.props.style)).toMatchObject({
      width: 36,
      height: 36,
      borderRadius: 100,
      top: 12,
      right: 11.67,
    });
  });
});
