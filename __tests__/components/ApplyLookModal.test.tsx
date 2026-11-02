import React from 'react';
import { AccessibilityInfo, Text } from 'react-native';
import { act } from 'react-test-renderer';
import { getByLabel, press, render } from '../helpers/render';
import { LookPreviewImage } from '../../src/components/look/LookPreviewImage';
import { focusDesktopNode } from '../../src/components/modals/focusDesktopNode';
import { ApplyLookModal } from '../../src/components/modals/ApplyLookModal';

jest.mock('../../src/components/modals/focusDesktopNode', () => ({
  focusDesktopNode: jest.fn(),
}));

jest.mock('../../src/components/look/LookPreviewImage', () => ({
  LookPreviewImage: () => null,
}));

const photo = {
  file: { thumbnailUri: 'file:///thumb.jpg', uri: 'file:///m.jpg' },
} as never;

jest.mock('../../src/lib/storage/localStorage', () => ({
  isUsableThumbnailUri: (uri?: string) => Boolean(uri),
  isUsableDetailUri: () => false,
}));

type Props = React.ComponentProps<typeof ApplyLookModal>;

function mount(overrides: Partial<Props> = {}) {
  const props: Props = {
    visible: true,
    albumName: 'Summer Wedding',
    previewPhoto: photo,
    currentLookId: 'cleanNatural',
    onUseLook: jest.fn(),
    onClose: jest.fn(),
    ...overrides,
  };
  const view = render(<ApplyLookModal {...props} />);
  return { ...view, props };
}

describe('ApplyLookModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
  });

  it('shows title, album name and catalog labels with Current', () => {
    const { renderer } = mount();
    const texts = renderer.root
      .findAllByType(Text)
      .map(node => [node.props.children].flat(3).join(''));
    expect(texts).toEqual(
      expect.arrayContaining([
        'Edit Photos',
        'Summer Wedding',
        'Original',
        'Clean Natural · Current',
        'Warm Romantic',
        'Film Mood',
      ]),
    );
  });

  it('starts with the current look selected and After active', () => {
    const { renderer } = mount();
    expect(
      getByLabel(renderer, 'Clean Natural, current look').props
        .accessibilityState,
    ).toEqual({ selected: true });
    expect(getByLabel(renderer, 'Original').props.accessibilityState).toEqual({
      selected: false,
    });
    expect(getByLabel(renderer, 'After').props.accessibilityState).toEqual({
      selected: true,
    });
  });

  it('selects a tile and sends its id from Use this look', () => {
    const { renderer, props } = mount();
    press(getByLabel(renderer, 'Film Mood'));
    expect(getByLabel(renderer, 'Film Mood').props.accessibilityState).toEqual({
      selected: true,
    });
    press(getByLabel(renderer, 'Use this look'));
    expect(props.onUseLook).toHaveBeenCalledWith('filmMood');
  });

  it('Before shows the original, After shows the selected look', () => {
    const { renderer } = mount();
    // The big preview renders before the tiles.
    const previewLook = () =>
      renderer.root.findAllByType(LookPreviewImage)[0]!.props.lookId;
    press(getByLabel(renderer, 'Before'));
    expect(getByLabel(renderer, 'Before').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(previewLook()).toBe('original');
    press(getByLabel(renderer, 'After'));
    expect(previewLook()).toBe('cleanNatural');
  });

  it('calls onClose from Cancel and Close, and Escape', () => {
    const { renderer, props } = mount();
    press(getByLabel(renderer, 'Cancel'));
    press(getByLabel(renderer, 'Close'));
    expect(props.onClose).toHaveBeenCalledTimes(2);
    const card = renderer.root.findAll(
      node =>
        typeof node.props.onKeyDown === 'function' &&
        Boolean(node.props.keyDownEvents),
    )[0]!;
    act(() => {
      card.props.onKeyDown({ nativeEvent: { key: 'Escape' } });
    });
    expect(props.onClose).toHaveBeenCalledTimes(3);
  });

  it('exposes roles, labels and one tab stop', () => {
    const { renderer } = mount();
    const group = renderer.root.find(
      node => node.props.accessibilityRole === 'radiogroup',
    );
    expect(group.props.accessibilityLabel).toBe('Choose a look for this album');
    const current = getByLabel(renderer, 'Clean Natural, current look');
    expect(current.props.accessibilityRole).toBe('radio');
    expect(current.props.focusable).toBe(true);
    expect(getByLabel(renderer, 'Film Mood').props.focusable).toBe(false);
    expect(getByLabel(renderer, 'Before').props.accessibilityRole).toBe('tab');
    expect(
      renderer.root.find(node => node.props.accessibilityRole === 'tablist')
        .props.accessibilityLabel,
    ).toBe('Compare before and after');
    expect(
      renderer.root.find(node => node.props.accessibilityRole === 'image').props
        .accessibilityLabel,
    ).toBe('Preview, Clean Natural');
  });

  it('focuses the current tile on open', () => {
    mount();
    expect(focusDesktopNode).toHaveBeenCalledTimes(1);
  });

  it('moves selection and focus with arrow keys, wrapping around', () => {
    const { renderer } = mount({ currentLookId: 'original' });
    const group = () =>
      renderer.root.find(node => node.props.accessibilityRole === 'radiogroup');
    const key = (name: string) =>
      act(() => {
        group().props.onKeyDown({ nativeEvent: { key: name } });
      });
    (focusDesktopNode as jest.Mock).mockClear();
    key('ArrowRight');
    expect(
      getByLabel(renderer, 'Clean Natural').props.accessibilityState,
    ).toEqual({ selected: true });
    expect(focusDesktopNode).toHaveBeenCalledTimes(1);
    key('ArrowLeft');
    key('ArrowLeft');
    expect(getByLabel(renderer, 'Film Mood').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(focusDesktopNode).toHaveBeenCalledTimes(3);
    key('Enter');
    expect(focusDesktopNode).toHaveBeenCalledTimes(3);
  });

  it('announces the title on open', () => {
    mount();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Edit Photos. Summer Wedding',
    );
  });
});
