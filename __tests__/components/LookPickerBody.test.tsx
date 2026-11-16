import React from 'react';
import { act } from 'react-test-renderer';
import { LookPickerBody } from '../../src/components/look/LookPickerBody';
import type { LookId } from '../../src/lib/look/types';
import { getByLabel, press, render } from '../helpers/render';

jest.mock('../../src/components/modals/focusDesktopNode', () => ({
  focusDesktopNode: jest.fn(),
}));

jest.mock('../../src/components/look/ContainedLookImage', () => ({
  ContainedLookImage: () => null,
}));

const getAllByRole = (
  renderer: ReturnType<typeof render>['renderer'],
  role: string,
) =>
  renderer.root.findAll(
    node => typeof node.type === 'string' && node.props.accessibilityRole === role,
  );

type Props = React.ComponentProps<typeof LookPickerBody>;

const customLook = { name: 'Moody Film', revision: 'r1', finishing: null };

function mount(overrides: Partial<Props> = {}) {
  const props: Props = {
    visible: true,
    previewUri: 'file:///t.jpg',
    currentLookId: 'original',
    selectedLookId: 'original',
    showAfter: true,
    onSelectLook: jest.fn(),
    onShowAfterChange: jest.fn(),
    ...overrides,
  };
  return { props, ...render(<LookPickerBody {...props} />) };
}

describe('LookPickerBody custom look and import error', () => {
  it('renders no custom tile or banner by default', () => {
    const { renderer } = mount();
    expect(getAllByRole(renderer, 'radio')).toHaveLength(4);
    expect(getAllByRole(renderer, 'alert')).toHaveLength(0);
  });

  it('renders the custom tile as a selectable radio labelled by preset name', () => {
    const { renderer, props } = mount({ customLook });
    expect(getAllByRole(renderer, 'radio')).toHaveLength(5);
    const tile = getByLabel(renderer, 'Moody Film');
    expect(tile.props.accessibilityRole).toBe('radio');
    press(tile);
    expect(props.onSelectLook).toHaveBeenCalledWith('custom');
  });

  it('marks the selected custom tile', () => {
    const { renderer } = mount({ customLook, selectedLookId: 'custom' });
    expect(getByLabel(renderer, 'Moody Film').props.accessibilityState).toEqual(
      { selected: true },
    );
  });

  it('keeps Upload preset a button and calls onUploadPreset', () => {
    const onUploadPreset = jest.fn();
    const { renderer } = mount({ customLook, onUploadPreset });
    const upload = getByLabel(renderer, 'Upload preset');
    expect(upload.props.accessibilityRole).toBe('button');
    press(upload);
    expect(onUploadPreset).toHaveBeenCalledTimes(1);
  });

  it('arrow keys step Original, looks, custom and wrap', () => {
    const selected: LookId[] = [];
    const { renderer, rerender, props } = mount({
      customLook,
      onSelectLook: id => selected.push(id),
    });
    const key = (name: string) =>
      act(() => {
        renderer.root
          .find(node => node.props.accessibilityRole === 'radiogroup')
          .props.onKeyDown({ nativeEvent: { key: name } });
      });
    const step = (from: LookId, name: string) => {
      rerender(<LookPickerBody {...props} selectedLookId={from} />);
      key(name);
    };
    step('original', 'ArrowRight');
    step('cleanNatural', 'ArrowRight');
    step('warmRomantic', 'ArrowRight');
    step('filmMood', 'ArrowRight');
    step('custom', 'ArrowRight');
    step('original', 'ArrowLeft');
    expect(selected).toEqual([
      'cleanNatural',
      'warmRomantic',
      'filmMood',
      'custom',
      'original',
      'custom',
    ]);
  });

  it('without a custom look the last tile wraps to Original', () => {
    const selected: LookId[] = [];
    const { renderer } = mount({
      selectedLookId: 'filmMood',
      onSelectLook: id => selected.push(id),
    });
    act(() => {
      renderer.root
        .find(node => node.props.accessibilityRole === 'radiogroup')
        .props.onKeyDown({ nativeEvent: { key: 'ArrowRight' } });
    });
    expect(selected).toEqual(['original']);
  });

  it.each([
    ['unsupported', "Unsupported file format. Your album look hasn't changed."],
    ['unreadable', "This file can't be read. Your album look hasn't changed."],
  ] as const)('shows the %s banner', (importError, message) => {
    const { renderer } = mount({ importError });
    expect(getAllByRole(renderer, 'alert')[0]!.props.accessibilityLabel).toBe(
      message,
    );
  });
});
