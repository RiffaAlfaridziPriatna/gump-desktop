import React from 'react';
import TestRenderer, {act, type ReactTestRenderer} from 'react-test-renderer';
import {
  AccessibilityInfo,
  NativeModules,
  Platform,
  Text,
  UIManager,
} from 'react-native';
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

const realFindNodeHandle = Object.getOwnPropertyDescriptor(
  require('react-native'),
  'findNodeHandle',
)!;
const realFocus = (UIManager as {focus?: unknown}).focus;
const realDispatch = UIManager.dispatchViewManagerCommand;
const focus = jest.fn();
const dispatch = jest.fn();
const announce = jest.fn();

function stubDesktopFocus() {
  (UIManager as {focus?: unknown}).focus = focus;
  UIManager.dispatchViewManagerCommand = dispatch;
  // RN exposes findNodeHandle as a getter, which jest.spyOn cannot wrap.
  Object.defineProperty(require('react-native'), 'findNodeHandle', {
    configurable: true,
    value: () => 7,
  });
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(announce);
}

afterAll(() => {
  Object.defineProperty(require('react-native'), 'findNodeHandle', realFindNodeHandle);
  (UIManager as {focus?: unknown}).focus = realFocus;
  UIManager.dispatchViewManagerCommand = realDispatch;
});

describe('ExportPhotosModal failure states', () => {
  beforeEach(() => {
    focus.mockClear();
    dispatch.mockClear();
    announce.mockClear();
    stubDesktopFocus();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('shows the required size for a full staging disk', async () => {
    const {renderer} = await prepare({disk: 'lowStaging'});
    expect(allText(renderer)).toEqual([
      'Not enough space on this computer',
      'This export needs 0.5 GB. Free up space or choose another location.',
      'Try again',
      'Cancel',
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
    expect(focus).toHaveBeenCalledWith(7);
    expect(announce).toHaveBeenCalledWith(
      'Saving was cancelled. Your export is still ready.',
    );
    const save = getByLabel(renderer, 'Save to computer');
    expect(save.props.accessibilityRole).toBe('button');
  });
});

describe('ExportFailureView accessibility', () => {
  beforeEach(() => {
    focus.mockClear();
    dispatch.mockClear();
    announce.mockClear();
    stubDesktopFocus();
  });
  afterEach(() => {
    Platform.OS = 'macos' as typeof Platform.OS;
  });

  function mount(failedStep: 'prepare' | 'download', reason = 'folderNotWritable') {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ExportFailureView
          reason={reason}
          failedStep={failedStep}
          onTryAgain={jest.fn()}
          onChangeSaveLocation={jest.fn()}
          onCancel={jest.fn()}
        />,
        {createNodeMock: () => ({})},
      );
    });
    return renderer;
  }

  it('labels buttons, focuses the primary one and announces the failure', () => {
    const renderer = mount('download');
    expect(focus).toHaveBeenCalledWith(7);
    expect(announce).toHaveBeenCalledWith(
      "Can't save to this folder. Choose another location or check the folder's permissions.",
    );
    expect(getByLabel(renderer, 'Try again').props.accessibilityRole).toBe(
      'button',
    );
    expect(
      getByLabel(renderer, 'Change save location').props.accessibilityRole,
    ).toBe('button');
    const alert = renderer.root.findByProps({accessibilityRole: 'alert'});
    expect(alert.props.accessibilityLiveRegion).toBe('assertive');
    const icon = renderer.root.findByProps({
      importantForAccessibility: 'no-hide-descendants',
    });
    expect(icon.props.accessibilityElementsHidden).toBe(true);
  });

  it('offers Cancel instead of Change save location at the prepare stage', () => {
    const renderer = mount('prepare');
    expect(getByLabel(renderer, 'Cancel').props.accessibilityRole).toBe('button');
    expect(
      renderer.root.findAllByProps({accessibilityLabel: 'Change save location'}),
    ).toHaveLength(0);
  });

  it('focuses through the Windows view command on Windows', () => {
    Platform.OS = 'windows' as typeof Platform.OS;
    mount('download');
    expect(dispatch).toHaveBeenCalledWith(7, 'focus', []);
    expect(focus).not.toHaveBeenCalled();
  });
});
