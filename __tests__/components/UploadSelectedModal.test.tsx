import React from 'react';
import {act, type ReactTestRenderer} from 'react-test-renderer';
import {AccessibilityInfo, AppState, Text} from 'react-native';
import {
  makeCurrentUserRefetch,
  type FakeCloudStorageScenario,
} from '../helpers/exportUploadFakes';
import {render} from '../helpers/render';

let mockRefetch: ReturnType<typeof makeCurrentUserRefetch>;
const mockOpenUpgradePlan = jest.fn();
const mockReportError = jest.fn();

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
  }: {phase?: UploadSelectedPhase; uploadSizeGb?: number; photoCount?: number} = {},
) {
  mockRefetch = makeCurrentUserRefetch(scenario);
  const onClose = jest.fn();
  const onOpenAlbum = jest.fn();
  const view = render(
    <UploadSelectedModal
      visible
      phase={phase}
      photoCount={photoCount}
      uploadSizeGb={uploadSizeGb}
      onClose={onClose}
      onUploadNow={jest.fn(async () => undefined)}
      onOpenAlbum={onOpenAlbum}
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
        visible
        phase="confirm"
        photoCount={99}
        uploadSizeGb={0.6}
        onClose={jest.fn()}
        onUploadNow={jest.fn(async () => undefined)}
        onOpenAlbum={jest.fn()}
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
      text: '121.0 GB / 300 GB',
    });
  });

  it('adds the orange banner near the limit', async () => {
    const {renderer} = await mount('nearLimit');
    expect(texts(renderer)).toContain(
      "You'll have 0.3 GB of cloud storage left after this upload.",
    );
    expect(buttonLabels(renderer)).toContain('Upload now');
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
});
