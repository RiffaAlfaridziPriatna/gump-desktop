import React from 'react';
import { AccessibilityInfo, Text } from 'react-native';
import { act } from 'react-test-renderer';
import { getByLabel, press, render } from '../helpers/render';
import { focusDesktopNode } from '../../src/components/modals/focusDesktopNode';
import { ApplyLookModal } from '../../src/components/modals/ApplyLookModal';

jest.mock('../../src/lib/look/importAlbumPreset', () => ({
  importAlbumPreset: jest.fn(),
}));

jest.mock('../../src/components/modals/focusDesktopNode', () => ({
  focusDesktopNode: jest.fn(),
}));

jest.mock('../../src/components/look/LookPreviewImage', () => ({
  LookPreviewImage: () => null,
}));

jest.mock('../../src/components/look/ContainedLookImage', () => {
  const ReactNative = require('react-native');
  return {
    ContainedLookImage: (props: Record<string, unknown>) => (
      <ReactNative.View testID="contained-look-image" {...props} />
    ),
  };
});

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
    albumId: 'album-1',
    albumName: 'Summer Wedding',
    customLook: null,
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
    const preview = getByLabel(renderer, 'Preview, Clean Natural');
    const frame = preview.parent;
    if (!frame?.props.onLayout) {
      throw new Error('preview frame missing onLayout');
    }
    act(() => {
      frame.props.onLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 480, height: 326 } },
      });
    });
    // Main preview is the contain-fit image with isTransparent={false}.
    const previewLook = () =>
      renderer.root.findAllByProps({ testID: 'contained-look-image' }).find(
        node => node.props.isTransparent === false,
      )!.props.lookId;
    press(getByLabel(renderer, 'Before'));
    expect(getByLabel(renderer, 'Before').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(previewLook()).toBe('original');
    press(getByLabel(renderer, 'After'));
    expect(previewLook()).toBe('cleanNatural');
  });

  it('hides Before/After when Original is selected', () => {
    const { renderer } = mount({ currentLookId: 'original' });
    expect(
      renderer.root.findAll(
        node => node.props.accessibilityRole === 'tablist',
      ),
    ).toHaveLength(0);
    expect(
      renderer.root.findAll(node => node.props.accessibilityLabel === 'Before'),
    ).toHaveLength(0);
    press(getByLabel(renderer, 'Clean Natural'));
    expect(getByLabel(renderer, 'Before')).toBeTruthy();
    expect(getByLabel(renderer, 'After')).toBeTruthy();
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

  it('focuses a mounted tile when reopened from hidden', () => {
    const { rerender, props } = mount({ visible: false });
    (focusDesktopNode as jest.Mock).mockClear();
    rerender(<ApplyLookModal {...props} visible />);
    expect(focusDesktopNode).toHaveBeenCalledTimes(1);
    expect((focusDesktopNode as jest.Mock).mock.calls[0][0]).not.toBeNull();
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
