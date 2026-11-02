import React from 'react';
import {act, type ReactTestRenderer} from 'react-test-renderer';
import {AccessibilityInfo, Text} from 'react-native';
import {
  makeCurrentUserRefetch,
  type FakeCloudStorageScenario,
} from '../helpers/exportUploadFakes';
import {render} from '../helpers/render';
import {
  createCulledAlbumFromSelection,
  createCulledAlbumPhoto,
  type CulledAlbumPhoto,
} from '../../src/lib/culledAlbum/types';
import type {UploadFailureCause} from '../../src/lib/culledAlbum/uploadPreflight';
import {culledAlbumStore} from '../../src/lib/culledAlbum/store';
import {
  photoKey,
  photoStateStore,
} from '../../src/lib/culledAlbum/photoStateStore';
import {uploadQueueStore} from '../../src/lib/culledAlbum/uploadQueueStore';

let mockRefetch: ReturnType<typeof makeCurrentUserRefetch>;
const mockRetryUploadLookBake = jest.fn();
const mockFocus = jest.fn();

jest.mock('@lib/navigation/uploadAwareNavigation', () => ({
  shouldDeferHeavyWorkForNavigation: () => false,
  shouldYieldUploadQueueForNavigation: () => false,
  runOrDeferHeavyWorkForNavigation: (fn: () => void) => fn(),
}));
jest.mock('../../src/di/container', () => ({container: {resolve: jest.fn()}}));
jest.mock('../../src/lib/culledAlbum/storage', () => ({}));
jest.mock('../../src/lib/culledAlbum/sync', () => ({}));
jest.mock('../../src/application/syncPhotoRepository', () => ({}));
jest.mock('../../src/lib/observability/posthogClient', () => ({
  captureAppEvent: jest.fn(),
  captureAppException: jest.fn(),
}));
jest.mock('../../src/lib/culledAlbum/photoLoader', () => ({
  ...jest.requireActual('../../src/lib/culledAlbum/photoLoader'),
  hydratePhotos: jest.fn(() => []),
}));
jest.mock('@lib/observability/reportError', () => ({reportError: jest.fn()}));
jest.mock('@lib/plan/billingLinks', () => ({openUpgradePlan: jest.fn()}));
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
jest.mock('@context/culledAlbumHooks', () => ({
  ...jest.requireActual('@context/culledAlbumHooks'),
  useCulledAlbumActions: () => ({
    retryFailedServerUploads: jest.requireActual(
      '../../src/lib/culledAlbum/store',
    ).retryFailedServerUploads,
    retryUploadLookBake: mockRetryUploadLookBake,
  }),
}));
jest.mock('../../src/components/modals/focusDesktopNode', () => ({
  focusDesktopNode: (node: unknown) => mockFocus(node),
}));

import {UploadSelectedModal} from '../../src/components/modals/UploadSelectedModal';

const ALBUM = 'album-1';
const GIB = 1024 ** 3;

type Seed = {
  id: string;
  status: CulledAlbumPhoto['serverUploadStatus'];
  cause?: UploadFailureCause;
  size?: number;
};

function seed(photos: Seed[]): void {
  const photoState: Record<string, CulledAlbumPhoto> = {};
  for (const {id, status, cause, size} of photos) {
    const photo = createCulledAlbumPhoto(
      {uri: `file:///a/${id}.jpg`, name: `${id}.jpg`, type: 'image/jpeg', size: size ?? 10},
      id,
    );
    photo.serverUploadStatus = status;
    photo.serverUploadCause = cause;
    photoState[photoKey(ALBUM, id)] = photo;
  }
  photoStateStore.setState(() => ({
    photoState,
    photoOrder: {[ALBUM]: photos.map(p => p.id)},
  }));
  const album = createCulledAlbumFromSelection({
    id: ALBUM,
    name: 'a',
    title: null,
    cover: null,
    coverMobile: null,
    link: '',
  } as never);
  album.uploadBatchPhotoIds = photos.map(p => p.id);
  culledAlbumStore.setState(state => {
    state.albums = {[ALBUM]: album};
  });
}

const photoOf = (id: string) =>
  photoStateStore.getState().photoState[photoKey(ALBUM, id)]!;

function texts(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAllByType(Text)
    .map(node => [node.props.children].flat(3).join(''));
}

function buttonLabels(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAll(n => n.props.accessibilityRole === 'button' && typeof n.type === 'string')
    .map(n => n.props.accessibilityLabel);
}

async function press(renderer: ReactTestRenderer, label: string) {
  const node = renderer.root.find(
    n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function',
  );
  await act(async () => {
    node.props.onPress();
  });
}

const mounted: ReactTestRenderer[] = [];

async function mount(
  props: {
    phase?: 'complete' | 'uploading';
    scenario?: FakeCloudStorageScenario;
    bakeDiskFull?: {requiredBytes?: number};
  } = {},
) {
  mockRefetch = makeCurrentUserRefetch(props.scenario ?? 'normal');
  const onClose = jest.fn();
  const onOpenAlbum = jest.fn();
  const view = render(
    <UploadSelectedModal
      visible
      albumId={ALBUM}
      phase={props.phase ?? 'complete'}
      photoCount={5}
      uploadSizeGb={0}
      bakeDiskFull={props.bakeDiskFull}
      onClose={onClose}
      onUploadNow={jest.fn(async () => undefined)}
      onOpenAlbum={onOpenAlbum}
    />,
  );
  mounted.push(view.renderer);
  await act(async () => {});
  return {renderer: view.renderer, onClose, onOpenAlbum};
}

describe('upload failure states', () => {
  let announce: jest.SpyInstance;
  beforeEach(() => {
    jest.clearAllMocks();
    uploadQueueStore.setState(state => {
      state.queues = {};
    });
    announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
  });
  afterEach(() => {
    mounted.splice(0).forEach(r => act(() => r.unmount()));
    jest.restoreAllMocks();
  });

  it('renders partial failure copy, announces it and focuses Retry', async () => {
    seed([
      {id: 'a', status: 'uploaded'},
      {id: 'b', status: 'uploaded'},
      {id: 'c', status: 'uploaded'},
      {id: 'd', status: 'failed', cause: 'network'},
      {id: 'e', status: 'failed', cause: 'server'},
    ]);
    const {renderer, onOpenAlbum} = await mount();
    expect(texts(renderer)).toEqual([
      '3 of 5 photos uploaded',
      '2 photos failed. Retry uploads only these 2.',
      'Retry 2 photos',
      'Back to album',
    ]);
    expect(buttonLabels(renderer)).toEqual(['Retry 2 photos', 'Back to album']);
    expect(
      renderer.root.find(n => n.props.accessibilityRole === 'alert').props
        .accessibilityLiveRegion,
    ).toBe('assertive');
    expect(announce).toHaveBeenLastCalledWith(
      '3 of 5 photos uploaded. 2 photos failed. Retry uploads only these 2',
    );
    expect(mockFocus).toHaveBeenCalledTimes(1);
    await press(renderer, 'Back to album');
    expect(onOpenAlbum).toHaveBeenCalled();
  });

  it('renders the all-failed frame with 0 uploaded', async () => {
    seed([
      {id: 'a', status: 'failed', cause: 'timeout'},
      {id: 'b', status: 'failed', cause: 'rateLimited'},
    ]);
    const {renderer} = await mount();
    expect(texts(renderer).slice(0, 3)).toEqual([
      '0 of 2 photos uploaded',
      '2 photos failed. Retry uploads only these 2.',
      'Retry 2 photos',
    ]);
  });

  it('adds the final line and hides Retry when only final photos failed', async () => {
    seed([
      {id: 'a', status: 'uploaded'},
      {id: 'b', status: 'failed', cause: 'rejected'},
      {id: 'c', status: 'failed', cause: 'sourceMissing'},
    ]);
    const {renderer} = await mount();
    expect(texts(renderer)).toEqual([
      '1 of 3 photos uploaded',
      "2 photos can't be uploaded.",
      'Back to album',
    ]);
    expect(buttonLabels(renderer)).toEqual(['Back to album']);
  });

  it('shows both lines when retryable and final photos failed', async () => {
    seed([
      {id: 'a', status: 'failed', cause: 'network'},
      {id: 'b', status: 'failed', cause: 'rejected'},
    ]);
    const {renderer} = await mount();
    expect(texts(renderer)[1]).toBe(
      "1 photo failed. Retry uploads only this photo.\n1 photo can't be uploaded.",
    );
    expect(buttonLabels(renderer)).toContain('Retry 1 photo');
  });

  it('Retry re-queues only retryable photos through the real store action', async () => {
    seed([
      {id: 'net', status: 'failed', cause: 'network'},
      {id: 'quota', status: 'failed', cause: 'storageLimit'},
      {id: 'final', status: 'failed', cause: 'rejected'},
      {id: 'done', status: 'uploaded'},
    ]);
    // Check pending: quota photos are not offered yet.
    mockRefetch = jest.fn(() => new Promise(() => undefined)) as never;
    const view = render(
      <UploadSelectedModal
        visible
        albumId={ALBUM}
        phase="complete"
        photoCount={4}
        uploadSizeGb={0}
        onClose={jest.fn()}
        onUploadNow={jest.fn(async () => undefined)}
        onOpenAlbum={jest.fn()}
      />,
    );
    mounted.push(view.renderer);
    await act(async () => {});
    expect(buttonLabels(view.renderer)).toContain('Retry 1 photo');
    await press(view.renderer, 'Retry 1 photo');
    expect(photoOf('net').serverUploadStatus).toBe('pending');
    expect(photoOf('quota').serverUploadStatus).toBe('failed');
    expect(photoOf('final').serverUploadStatus).toBe('failed');
  });

  it('shows Not enough cloud storage for quota photos when the retry does not fit', async () => {
    seed([
      {id: 'a', status: 'uploaded'},
      {id: 'q', status: 'failed', cause: 'dataUsageLimit', size: GIB},
    ]);
    const {renderer} = await mount({scenario: 'exceeded'});
    expect(texts(renderer)[0]).toBe('Not enough cloud storage');
    expect(buttonLabels(renderer)).toEqual([
      'View cloud plans',
      'Choose fewer photos',
    ]);
  });

  it('offers quota photos for retry once a fresh check fits', async () => {
    seed([
      {id: 'a', status: 'uploaded'},
      {id: 'n', status: 'failed', cause: 'network'},
      {id: 'q', status: 'failed', cause: 'storageLimit'},
    ]);
    const {renderer} = await mount({scenario: 'normal'});
    expect(texts(renderer)).toEqual([
      '1 of 3 photos uploaded',
      '2 photos failed. Retry uploads only these 2.',
      'Retry 2 photos',
      'Back to album',
    ]);
    await press(renderer, 'Retry 2 photos');
    expect(photoOf('q').serverUploadStatus).toBe('pending');
    expect(photoOf('n').serverUploadStatus).toBe('pending');
  });

  it('renders the bake disk-full state; Try again re-runs the bake, Cancel closes', async () => {
    seed([{id: 'a', status: 'pending'}]);
    const {renderer, onClose} = await mount({
      phase: 'uploading',
      bakeDiskFull: {requiredBytes: 0.6 * GIB},
    });
    expect(texts(renderer)).toEqual([
      'Not enough space on this computer',
      'This upload needs 0.6 GB of free space to apply looks. Free up space and try again.',
      'Try again',
      'Cancel',
    ]);
    expect(announce).toHaveBeenLastCalledWith(
      'Not enough space on this computer. This upload needs 0.6 GB of free space to apply looks. Free up space and try again',
    );
    expect(mockFocus).toHaveBeenCalledTimes(1);
    await press(renderer, 'Try again');
    expect(mockRetryUploadLookBake).toHaveBeenCalledWith(ALBUM);
    await press(renderer, 'Cancel');
    expect(onClose).toHaveBeenCalled();
  });
});
