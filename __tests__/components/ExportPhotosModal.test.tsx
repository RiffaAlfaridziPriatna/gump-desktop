import React from 'react';
import TestRenderer, {act, type ReactTestRenderer} from 'react-test-renderer';
import {NativeModules, Platform, Text, UIManager} from 'react-native';
import {
  makeFakeGumpLocalStorage,
  type FakeLocalStorageOptions,
} from '../helpers/exportUploadFakes';
import {makeCulledAlbumPhoto} from '../helpers/fixtures';
import {getByLabel, render} from '../helpers/render';

// nativeExport captures the module at import, so install a mutable delegate first.
const native: Record<string, unknown> = {};
NativeModules.GumpLocalStorage = native;
// Jest runs as ios; export is gated to desktop platforms.
Platform.OS = 'macos' as typeof Platform.OS;

const {ExportPhotosModal} = require('../../src/components/modals/ExportPhotosModal');
const {ExportFailureView} = require('../../src/components/modals/ExportFailureView');

const photo = makeCulledAlbumPhoto({photoId: 'p1'});
photo.file.detailUri = 'file:///fake/details/p1.d1.jpg';

function install(options: FakeLocalStorageOptions) {
  const fake = makeFakeGumpLocalStorage(options);
  Object.assign(native, fake);
  return fake;
}

function allText(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(Text)
    .map(node => [node.props.children].flat(3).join(''));
}

async function pressText(renderer: ReactTestRenderer, text: string) {
  const label = renderer.root
    .findAllByType(Text)
    .find(node => [node.props.children].flat(3).join('') === text);
  let node = label?.parent;
  while (node && !node.props.onPress) {
    node = node.parent;
  }
  if (!node) {
    throw new Error(`No pressable for "${text}"`);
  }
  await act(async () => {
    node!.props.onPress();
  });
}

function mountModal() {
  const view = render(
    <ExportPhotosModal
      visible
      photoCount={1}
      albumId="album-1"
      albumName="Trip"
      selectedPhotos={[photo]}
      onClose={jest.fn()}
    />,
  );
  return view.renderer;
}

async function prepare(options: FakeLocalStorageOptions) {
  const fake = install(options);
  const renderer = mountModal();
  await pressText(renderer, 'Prepare Export');
  return {fake, renderer};
}

describe('ExportPhotosModal failure states', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('shows the required size for a full staging disk', async () => {
    const {renderer} = await prepare({disk: 'lowStaging'});
    expect(allText(renderer)).toEqual([
      'Not enough space on this computer',
      'This export needs 0.5 GB. Free up space or choose another location.',
      'Try again',
    ]);
  });

  it('shows missing source files with Try again and Cancel, and re-runs prepare', async () => {
    const {fake, renderer} = await prepare({export: 'zipSourceMissing'});
    expect(allText(renderer)).toEqual([
      '2 source files are missing',
      'They were moved or deleted. Reconnect them and try again.',
      'Try again',
      'Cancel',
    ]);
    await pressText(renderer, 'Try again');
    expect(fake.createZipFromEntries).toHaveBeenCalledTimes(2);
  });

  it('shows an unknown prepare failure with today copy', async () => {
    install({});
    const renderer = mountModal();
    (native.createZipFromEntries as jest.Mock).mockRejectedValueOnce(
      new Error('boom'),
    );
    await pressText(renderer, 'Prepare Export');
    expect(allText(renderer)).toEqual([
      'Export failed',
      'Something went wrong while preparing your ZIP.',
      'Try again',
    ]);
  });

  it('shows a download failure for a full destination and retries only the save', async () => {
    const {fake, renderer} = await prepare({disk: 'lowDestination'});
    expect(allText(renderer)).toContain('Save to computer');
    await pressText(renderer, 'Save to computer');
    expect(allText(renderer)).toEqual([
      'Not enough space on this computer',
      'This export needs 0.5 GB. Free up space or choose another location.',
      'Try again',
      'Change save location',
    ]);
    await pressText(renderer, 'Try again');
    expect(fake.createZipFromEntries).toHaveBeenCalledTimes(1);
    expect(fake.getFreeDiskSpace).toHaveBeenCalledTimes(3);
  });

  it('shows a folder permission failure', async () => {
    const {renderer} = await prepare({export: 'copyNotWritable'});
    await pressText(renderer, 'Save to computer');
    expect(allText(renderer)).toEqual([
      "Can't save to this folder",
      "Choose another location or check the folder's permissions.",
      'Try again',
      'Change save location',
    ]);
  });

  it('returns to the ready view with the cancel message when the picker is cancelled', async () => {
    const {renderer} = await prepare({export: 'pickerCancelled'});
    // copyFile succeeds under pickerCancelled, so fail the save by hand.
    (native.copyFile as jest.Mock).mockRejectedValueOnce(
      Object.assign(new Error('nope'), {code: 'E_NOT_WRITABLE'}),
    );
    await pressText(renderer, 'Save to computer');
    await pressText(renderer, 'Change save location');
    const texts = allText(renderer);
    expect(texts).toContain('Your export is ready');
    expect(texts).toContain('Saving was cancelled. Your export is still ready.');
    expect(texts).toContain('Save to computer');
    expect(texts).not.toContain("Can't save to this folder");
  });
});

describe('ExportFailureView accessibility', () => {
  it('labels the buttons and focuses the primary one on mount', () => {
    const focus = jest.fn();
    (UIManager as {focus?: unknown}).focus = focus;
    // RN exposes findNodeHandle as a getter, which jest.spyOn cannot wrap.
    Object.defineProperty(require('react-native'), 'findNodeHandle', {
      configurable: true,
      value: () => 7,
    });
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ExportFailureView
          reason="folderNotWritable"
          failedStep="download"
          onTryAgain={jest.fn()}
          onChangeSaveLocation={jest.fn()}
          onCancel={jest.fn()}
        />,
        {createNodeMock: () => ({})},
      );
    });
    expect(focus).toHaveBeenCalledWith(7);
    expect(getByLabel(renderer, 'Try again').props.accessibilityRole).toBe(
      'button',
    );
    expect(
      getByLabel(renderer, 'Change save location').props.accessibilityRole,
    ).toBe('button');
  });
});
