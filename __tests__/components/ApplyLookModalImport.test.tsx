import React from 'react';
import { AccessibilityInfo, Text } from 'react-native';
import { act } from 'react-test-renderer';
import { getByLabel, press, render } from '../helpers/render';
import { ApplyLookModal } from '../../src/components/modals/ApplyLookModal';
import { importAlbumPreset } from '../../src/lib/look/importAlbumPreset';
import { reportError } from '../../src/lib/observability/reportError';
import { focusDesktopNode } from '../../src/components/modals/focusDesktopNode';

jest.mock('../../src/lib/look/importAlbumPreset', () => ({
  importAlbumPreset: jest.fn(),
}));
jest.mock('../../src/lib/observability/reportError', () => ({
  reportError: jest.fn(),
}));
jest.mock('../../src/components/modals/focusDesktopNode', () => ({
  focusDesktopNode: jest.fn(),
}));
jest.mock('../../src/components/look/LookPreviewImage', () => ({
  LookPreviewImage: () => null,
}));
jest.mock('../../src/components/look/ContainedLookImage', () => ({
  ContainedLookImage: () => null,
}));
jest.mock('../../src/lib/storage/localStorage', () => ({
  isUsableThumbnailUri: (uri?: string) => Boolean(uri),
  isUsableDetailUri: () => false,
}));

const mockImport = importAlbumPreset as jest.Mock;
const photo = {
  file: { thumbnailUri: 'file:///thumb.jpg', uri: 'file:///m.jpg' },
} as never;
const moody = { revision: 'r1', name: 'Moody Film' };
const UNSUPPORTED = "Unsupported file format. Your album look hasn't changed.";
const UNREADABLE = "This file can't be read. Your album look hasn't changed.";

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

async function upload(renderer: ReturnType<typeof mount>['renderer']) {
  await act(async () => {
    getByLabel(renderer, 'Upload preset').props.onPress();
  });
}

function texts(renderer: ReturnType<typeof mount>['renderer']) {
  return renderer.root.findAllByType(Text).map(node => node.props.children);
}

describe('ApplyLookModal preset import', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => {});
  });

  it('imports for this album and selects the new custom tile', async () => {
    mockImport.mockResolvedValue({ status: 'imported', customLook: moody });
    const { renderer, rerender, props } = mount();
    await upload(renderer);
    expect(mockImport).toHaveBeenCalledWith('album-1');
    // The screen passes the stored preset back down after the store update.
    rerender(<ApplyLookModal {...props} customLook={moody} />);
    expect(getByLabel(renderer, 'Moody Film').props.accessibilityState).toEqual(
      { selected: true },
    );
    expect(getByLabel(renderer, 'Preview, Moody Film')).toBeTruthy();
    press(getByLabel(renderer, 'Use this look'));
    expect(props.onUseLook).toHaveBeenCalledWith('custom');
  });

  it.each([
    ['unsupported', UNSUPPORTED],
    ['unreadable', UNREADABLE],
  ])('%s keeps the selected tile and shows the banner', async (reason, message) => {
    mockImport.mockResolvedValue({ status: 'failed', reason });
    const { renderer, props } = mount({ customLook: moody });
    press(getByLabel(renderer, 'Film Mood'));
    await upload(renderer);
    expect(texts(renderer)).toContain(message);
    expect(getByLabel(renderer, 'Film Mood').props.accessibilityState).toEqual({
      selected: true,
    });
    expect(getByLabel(renderer, 'Moody Film')).toBeTruthy();
    expect(props.onUseLook).not.toHaveBeenCalled();
  });

  it('clears the banner on the next tile select', async () => {
    mockImport.mockResolvedValue({ status: 'failed', reason: 'unreadable' });
    const { renderer } = mount();
    await upload(renderer);
    expect(texts(renderer)).toContain(UNREADABLE);
    press(getByLabel(renderer, 'Original'));
    expect(texts(renderer)).not.toContain(UNREADABLE);
  });

  it('clears the banner when the next upload starts and on cancel keeps it cleared', async () => {
    mockImport.mockResolvedValueOnce({ status: 'failed', reason: 'unsupported' });
    const { renderer } = mount();
    await upload(renderer);
    expect(texts(renderer)).toContain(UNSUPPORTED);
    mockImport.mockResolvedValueOnce({ status: 'cancelled' });
    await upload(renderer);
    expect(texts(renderer)).not.toContain(UNSUPPORTED);
    expect(
      getByLabel(renderer, 'Clean Natural, current look').props
        .accessibilityState,
    ).toEqual({ selected: true });
  });

  it('announces a repeated failure again', async () => {
    mockImport.mockResolvedValue({ status: 'failed', reason: 'unsupported' });
    const { renderer } = mount();
    await upload(renderer);
    await upload(renderer);
    const calls = (
      AccessibilityInfo.announceForAccessibility as jest.Mock
    ).mock.calls.filter(([text]) => text === UNSUPPORTED);
    expect(calls).toHaveLength(2);
  });

  it('reports an unexpected import rejection', async () => {
    const error = new Error('boom');
    mockImport.mockRejectedValue(error);
    const { renderer } = mount();
    await upload(renderer);
    expect(reportError).toHaveBeenCalledWith(error, {
      step: 'importAlbumPreset',
    });    expect(texts(renderer)).toContain(UNREADABLE);
  });

  it('focuses the new custom tile and announces it after import', async () => {
    mockImport.mockResolvedValue({ status: 'imported', customLook: moody });
    const { renderer, rerender, props } = mount();
    (focusDesktopNode as jest.Mock).mockClear();
    await upload(renderer);
    rerender(<ApplyLookModal {...props} customLook={moody} />);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Moody Film preset added and selected',
    );
    expect(focusDesktopNode).toHaveBeenCalledTimes(1);
    expect((focusDesktopNode as jest.Mock).mock.calls[0][0]).not.toBeNull();
    // Replacing the preset announces the new one too.
    mockImport.mockResolvedValue({
      status: 'imported',
      customLook: { revision: 'r2', name: 'Teal Mono' },
    });
    await upload(renderer);
    rerender(
      <ApplyLookModal
        {...props}
        customLook={{ revision: 'r2', name: 'Teal Mono' }}
      />,
    );
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      'Teal Mono preset added and selected',
    );
  });

  it('does not announce an existing preset on open', () => {
    mount({ customLook: moody, currentLookId: 'custom' });
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalledWith(
      'Moody Film preset added and selected',
    );
  });

  it('clears the banner when the dialog reopens', async () => {
    mockImport.mockResolvedValue({ status: 'failed', reason: 'unsupported' });
    const { renderer, rerender, props } = mount();
    await upload(renderer);
    rerender(<ApplyLookModal {...props} visible={false} />);
    rerender(<ApplyLookModal {...props} visible />);
    expect(texts(renderer)).not.toContain(UNSUPPORTED);
  });
});
