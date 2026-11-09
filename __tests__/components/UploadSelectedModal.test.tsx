import React from 'react';
import {act, type ReactTestRenderer} from 'react-test-renderer';
import {AccessibilityInfo, AppState, StyleSheet, Text} from 'react-native';
import {
  makeCurrentUserRefetch,
  type FakeCloudStorageScenario,
} from '../helpers/exportUploadFakes';
import {render} from '../helpers/render';
import {sansSemiBoldStyle} from '../../src/lib/ui/typography';

let mockRefetch: ReturnType<typeof makeCurrentUserRefetch>;
const mockOpenUpgradePlan = jest.fn();
const mockReportError = jest.fn();

jest.mock('@lib/navigation/uploadAwareNavigation', () => ({
  shouldDeferHeavyWorkForNavigation: () => false,
  shouldYieldUploadQueueForNavigation: () => false,
  runOrDeferHeavyWorkForNavigation: (fn: () => void) => fn(),
}));
jest.mock('../../src/di/container', () => ({container: {resolve: jest.fn()}}));
jest.mock('../../src/lib/culledAlbum/storage', () => ({}));
jest.mock('../../src/lib/culledAlbum/sync', () => ({}));
jest.mock('../../src/application/syncPhotoRepository', () => ({}));
jest.mock('@lib/observability/reportError', () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));
jest.mock('@lib/plan/billingLinks', () => ({
  openUpgradePlan: () => mockOpenUpgradePlan(),
}));
jest.mock('@hooks/useAuth', () => ({
  useAuthState: (selector: (s: {token: string}) => unknown) =>
    selector({token: 't'}),
}));
jest.mock('@context/auth', () => {
  const {useCallback, useState} = jest.requireActual('react');
  return {
    useCurrentUser: () => {
      const [data, setData] = useState(null);
      const refetch = useCallback(async () => {
        const result = await mockRefetch();
        setData(result.data);
        return {isError: false, ...result};
      }, []);
      return {data, refetch};
    },
  };
});

import {
  UploadSelectedModal,
  type UploadSelectedPhase,
} from '../../src/components/modals/UploadSelectedModal';

function texts(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(Text)
    .map(node => [node.props.children].flat(3).join(''));
}

function buttonLabels(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAll(node => node.props.accessibilityRole === 'button' && typeof node.type === 'string')
    .map(node => node.props.accessibilityLabel);
}

async function press(renderer: ReactTestRenderer, label: string) {
  const node = renderer.root.find(
    n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
  );
  await act(async () => {
    node.props.onPress();
  });
}

function progressValue(renderer: ReactTestRenderer) {
  return renderer.root.find(
    n => n.props.accessibilityRole === 'progressbar' && typeof n.type === 'string',
  ).props.accessibilityValue;
}

async function mount(
  scenario: FakeCloudStorageScenario,
  {
    phase = 'confirm',
    uploadSizeGb = 0.6,
    photoCount = 99,
    uploadedCount,
    uploadedBytes,
    totalUploadBytes,
  }: {
    phase?: UploadSelectedPhase;
    uploadSizeGb?: number;
    photoCount?: number;
    uploadedCount?: number;
    uploadedBytes?: number;
    totalUploadBytes?: number;
  } = {},
) {
  mockRefetch = makeCurrentUserRefetch(scenario);
  const onClose = jest.fn();
  const onOpenAlbum = jest.fn();
  const view = render(
    <UploadSelectedModal
      albumId="album-1"
      visible
      phase={phase}
      photoCount={photoCount}
      uploadedCount={uploadedCount}
      uploadedBytes={uploadedBytes}
      totalUploadBytes={totalUploadBytes}
      uploadSizeGb={uploadSizeGb}
      onClose={onClose}
      onUploadNow={jest.fn(async () => undefined)}
      onOpenAlbum={onOpenAlbum}
      onRetryStarted={jest.fn()}
    />,
  );
  await act(async () => {});
  return {renderer: view.renderer, onClose, onOpenAlbum};
}

describe('UploadSelectedModal cloud storage states', () => {
  let announce: jest.SpyInstance;
  beforeEach(() => {
    mockOpenUpgradePlan.mockReset().mockResolvedValue(undefined);
    mockReportError.mockReset();
    announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('shows checking copy without buttons while the refetch is pending', async () => {
    mockRefetch = jest.fn(() => new Promise(() => undefined)) as never;
    const view = render(
      <UploadSelectedModal
        albumId="album-1"
        visible
        phase="confirm"
        photoCount={99}
        uploadSizeGb={0.6}
        onClose={jest.fn()}
        onUploadNow={jest.fn(async () => undefined)}
        onOpenAlbum={jest.fn()}
        onRetryStarted={jest.fn()}
      />,
    );
    await act(async () => {});
    expect(texts(view.renderer)).toEqual([
      'Upload 99 photos to Gump Cloud',
      'Checking cloud storage…',
    ]);
    expect(buttonLabels(view.renderer).filter(Boolean)).not.toContain('Upload now');
    expect(announce).toHaveBeenCalledWith(
      'Upload 99 photos to Gump Cloud. Checking cloud storage…',
    );
  });

  it('shows unavailable copy; Try again refetches and Cancel closes', async () => {
    const {renderer, onClose} = await mount('refetchFails');
    expect(texts(renderer)).toEqual([
      "Couldn't check cloud storage",
      'Check your connection and try again.',
      'Try again',
      'Cancel',
    ]);
    expect(buttonLabels(renderer)).not.toContain('Upload now');
    await press(renderer, 'Try again');
    expect(mockRefetch).toHaveBeenCalledTimes(2);
    await press(renderer, 'Cancel');
    expect(onClose).toHaveBeenCalled();
  });

  it('shows the confirmation card with a progress value', async () => {
    const {renderer} = await mount('normal');
    expect(texts(renderer)).toEqual([
      'Upload 99 photos to Gump Cloud',
      'This upload',
      '0.6 GB',
      'Cloud storage used',
      '120.4 GB / 300 GB',
      'Storage after upload',
      '121.0 GB / 300 GB',
      'Upload now',
    ]);
    expect(progressValue(renderer)).toEqual({
      min: 0,
      max: 100,
      now: 40,
    });
  });

  it('adds the orange banner near the limit', async () => {
    const {renderer} = await mount('nearLimit');
    expect(texts(renderer)).toContain(
      "You'll have 0.3 GB of cloud storage left after this upload.",
    );
    expect(buttonLabels(renderer)).toContain('Upload now');
    expect(announce).toHaveBeenLastCalledWith(
      "Upload 99 photos to Gump Cloud. You'll have 0.3 GB of cloud storage left after this upload",
    );
    expect(
      renderer.root.find(n => n.props.accessibilityRole === 'header').props
        .accessibilityLiveRegion,
    ).toBe('polite');
  });

  it('announces the resolved state after checking', async () => {
    mockRefetch = makeCurrentUserRefetch('exceeded');
    await mount('exceeded');
    expect(announce.mock.calls[0][0]).toBe(
      'Upload 99 photos to Gump Cloud. Checking cloud storage…',
    );
    expect(announce.mock.calls.at(-1)?.[0]).toContain('Not enough cloud storage');
  });

  it('keeps the resolved view while refreshing', async () => {
    let listener: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _: string,
      cb: (state: string) => void,
    ) => {
      listener = cb;
      return {remove: jest.fn()};
    }) as never);
    const {renderer} = await mount('exceeded');
    mockRefetch = jest.fn(() => new Promise(() => undefined)) as never;
    await act(async () => {
      listener?.('active');
    });
    expect(texts(renderer)).toContain('View cloud plans');
    expect(texts(renderer)).not.toContain('Checking cloud storage…');
  });

  it('gives the uploading progress bar progressbar semantics', async () => {
    const {renderer} = await mount('normal', {phase: 'uploading'});
    expect(progressValue(renderer).now).toBe(0);
  });

  it('blocks upload when storage is not enough', async () => {
    const {renderer, onClose} = await mount('exceeded');
    expect(texts(renderer)).toEqual([
      'Not enough cloud storage',
      'This upload needs 0.6 GB. You have 0.2 GB remaining.',
      'This upload',
      '0.6 GB',
      'Cloud storage used',
      '4.8 GB / 5 GB',
      'Storage after upload',
      '5.4 GB / 5 GB',
      'Upgrade your cloud plan, free up storage or select fewer photos.',
      'View cloud plans',
      'Choose fewer photos',
    ]);
    expect(buttonLabels(renderer)).not.toContain('Upload now');
    expect(progressValue(renderer).now).toBe(100);
    expect(announce).toHaveBeenLastCalledWith(
      'Not enough cloud storage. This upload needs 0.6 GB. You have 0.2 GB remaining. Upgrade your cloud plan, free up storage or select fewer photos',
    );
    expect(
      renderer.root.find(n => n.props.accessibilityRole === 'alert').props
        .accessibilityLiveRegion,
    ).toBe('assertive');
    expect(
      renderer.root.findAll(
        n =>
          typeof n.type === 'string' &&
          n.props.accessibilityLabel ===
            'Warning: Upgrade your cloud plan, free up storage or select fewer photos.',
      ),
    ).toHaveLength(1);

    await press(renderer, 'View cloud plans');
    expect(mockOpenUpgradePlan).toHaveBeenCalledTimes(1);
    await press(renderer, 'Choose fewer photos');
    expect(onClose).toHaveBeenCalled();
  });

  it('reports a failure to open the plans page', async () => {
    const error = new Error('no browser');
    mockOpenUpgradePlan.mockRejectedValue(error);
    const {renderer} = await mount('exceeded');
    await press(renderer, 'View cloud plans');
    expect(mockReportError).toHaveBeenCalledWith(error, expect.any(Object));
  });

  it('re-checks storage when the app becomes active', async () => {
    let listener: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _: string,
      cb: (state: string) => void,
    ) => {
      listener = cb;
      return {remove: jest.fn()};
    }) as never);
    await mount('exceeded');
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      listener?.('active');
    });
    expect(mockRefetch).toHaveBeenCalledTimes(2);
  });

  it('shows numbers without a limit or bar on an unlimited plan', async () => {
    const {renderer} = await mount('unlimited');
    expect(texts(renderer)).toEqual([
      'Upload 99 photos to Gump Cloud',
      'This upload',
      '0.6 GB',
      'Cloud storage used',
      '42.5 GB',
      'Storage after upload',
      '43.1 GB',
      'Upload now',
    ]);
    expect(
      renderer.root.findAll(n => n.props.accessibilityRole === 'progressbar'),
    ).toHaveLength(0);
  });

  it('shows upload complete with a fresh storage card', async () => {
    const {renderer, onOpenAlbum} = await mount('normal', {phase: 'complete'});
    expect(texts(renderer)).toEqual([
      'Upload complete',
      '99 photos uploaded',
      'Storage used',
      '120.4 / 300 GB',
      'Back to album',
    ]);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
    expect(progressValue(renderer).now).toBe(40);
    await press(renderer, 'Back to album');
    expect(onOpenAlbum).toHaveBeenCalled();
  });

  it('lays out the uploading popup to Figma: height, gap, copy and meta line', async () => {
    const {renderer} = await mount('normal', {
      phase: 'uploading',
      uploadedCount: 45,
      uploadedBytes: 0.3 * 1024 ** 3,
      totalUploadBytes: 0.6 * 1024 ** 3,
    });
    expect(
      renderer.root.findAll(n => n.props.width === 720 && n.props.height === 456),
    ).not.toHaveLength(0);
    expect(texts(renderer)).toEqual([
      'Uploading 99 photos',
      'Please keep this window open',
      '45 of 99 photos · 0.3 GB of 0.6 GB',
    ]);
    const body = renderer.root.find(
      n => n.type === 'View' && StyleSheet.flatten(n.props.style)?.gap === 24,
    );
    expect(StyleSheet.flatten(body.props.style).width).toBe(480);
    const byText = (t: string) =>
      StyleSheet.flatten(
        renderer.root.find(
          n => n.type === 'Text' && [n.props.children].flat(3).join('') === t,
        ).props.style,
      );
    expect(byText('Please keep this window open').lineHeight).toBeCloseTo(14 * 1.44);
    expect(byText('45 of 99 photos · 0.3 GB of 0.6 GB')).toMatchObject({
      fontFamily: sansSemiBoldStyle.fontFamily,
      fontSize: 14,
      color: '#737373',
    });
  });

  it('uses a singular photo noun and a pill bar while uploading', async () => {
    const {renderer} = await mount('normal', {
      phase: 'uploading',
      photoCount: 1,
      uploadedCount: 0,
    });
    expect(texts(renderer)[0]).toBe('Uploading 1 photo');
    expect(texts(renderer)[2]).toMatch(/^0 of 1 photo · /);
    const track = renderer.root.find(
      n => n.type === 'View' && StyleSheet.flatten(n.props.style)?.height === 9,
    );
    expect(StyleSheet.flatten(track.props.style).borderRadius).toBe(4.5);
  });

  it('keeps the not-enough-storage popup 16 taller to offset the 40 bottom padding', async () => {
    const {renderer} = await mount('exceeded');
    expect(
      renderer.root.findAll(n => n.props.width === 720 && n.props.height === 511),
    ).not.toHaveLength(0);
  });

  it('sizes the not-enough-storage buttons and storage card to Figma', async () => {
    const {renderer} = await mount('exceeded');
    const style = (label: string) =>
      StyleSheet.flatten(
        renderer.root
          .find(n => n.props.accessibilityLabel === label && typeof n.props.style === 'function')
          .props.style({pressed: false}),
      );
    expect(style('View cloud plans')).toMatchObject({height: 48, flex: 0});
    expect(style('Choose fewer photos').minHeight).toBeUndefined();
    const textNode = renderer.root.find(
      n => n.props.accessibilityLabel === 'Choose fewer photos' && n.props.hitSlop,
    );
    expect(textNode.props.hitSlop).toEqual({top: 10, bottom: 10, left: 8, right: 8});
    const column = renderer.root.find(
      n => n.type === 'View' && StyleSheet.flatten(n.props.style)?.width === 456,
    );
    expect(StyleSheet.flatten(column.props.style)).toMatchObject({
      alignItems: 'center',
      gap: 12,
    });
    const value = StyleSheet.flatten(
      renderer.root.find(n => n.type === 'Text' && n.props.children === '0.6 GB')
        .props.style,
    );
    expect(value.fontFamily).toBe(sansSemiBoldStyle.fontFamily);
    expect(value.fontWeight).toBeUndefined();
    const bar = renderer.root.find(
      n => n.type === 'View' && StyleSheet.flatten(n.props.style)?.height === 9,
    );
    expect(StyleSheet.flatten(bar.props.style).borderRadius).toBe(4.5);
  });
});
