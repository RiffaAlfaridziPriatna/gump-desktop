import React from 'react';
import {Text} from 'react-native';
import {UploadToast} from '../../src/components/upload/UploadToast';
import {
  beginAnalysisQueue,
  beginServerUploadQueue,
  finishServerUploadQueue,
  uploadQueueStore,
} from '../../src/lib/culledAlbum/uploadQueueStore';
import {render} from '../helpers/render';

let mockAnalysisCounts: {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
} | null = null;
const mockPhotos: Array<{id: string; serverUploadStatus: string}> = [];

jest.mock('@context/culledAlbum', () => ({
  useCulledAlbumActions: () => ({
    hideToast: jest.fn(),
    requestCancelUpload: jest.fn(),
    requestCancelAnalysis: jest.fn(),
    failNotUploadedItems: jest.fn(),
    failNotAnalyzedItems: jest.fn(),
    clearCompleted: jest.fn(),
    clearFilenameDuplicates: jest.fn(),
  }),
  useCulledAlbumAnalysisCounts: () => mockAnalysisCounts,
  useCulledAlbumFilenameDuplicates: () => [],
  useCulledAlbumFilenameDuplicateToastMode: () => null,
  useCulledAlbumLocalImportProgress: () => null,
  useCulledAlbumServerUploadBatch: () => ({
    batchPhotoIds: mockPhotos.map(p => p.id),
    photos: mockPhotos,
  }),
  useCulledAlbumUiState: () => null,
}));

const albumId = 'album-1';

function labels(): string[] {
  const {renderer, unmount} = render(
    <UploadToast mode="serverUpload" albumId={albumId} />,
  );
  const texts = renderer.root
    .findAllByType(Text)
    .map(node => String(node.props.children));
  unmount();
  return texts;
}

function seed(uploaded: number, failed: number) {
  mockPhotos.length = 0;
  for (let i = 0; i < uploaded; i++) {
    mockPhotos.push({id: `u${i}`, serverUploadStatus: 'uploaded'});
  }
  for (let i = 0; i < failed; i++) {
    mockPhotos.push({id: `f${i}`, serverUploadStatus: 'failed'});
  }
  beginServerUploadQueue(albumId, uploaded + failed);
  finishServerUploadQueue(albumId, {
    status: 'completed',
    uploadedCount: uploaded,
    failedCount: failed,
  });
}

describe('UploadToast serverUpload completed label', () => {
  afterEach(() => {
    uploadQueueStore.setState(() => ({queues: {}}));
  });

  it('shows the plain label when nothing failed', () => {
    seed(3, 0);
    expect(labels()).toContain('Uploaded 3 photos to server');
  });

  it('shows ok out of total when some failed', () => {
    seed(2, 1);
    expect(labels()).toContain('Uploaded 2 out of 3 photos');
  });

  it('derives total from queue counts after a retry', () => {
    seed(1, 1);
    uploadQueueStore.setState(state => {
      state.queues[albumId].serverUpload.batchTotal = 1;
      state.queues[albumId].serverUpload.uploadedCount = 4;
      state.queues[albumId].serverUpload.failedCount = 1;
    });
    expect(labels()).toContain('Uploaded 4 out of 5 photos');
  });
});

describe('UploadToast analyze ETA', () => {
  afterEach(() => {
    mockAnalysisCounts = null;
    uploadQueueStore.setState(() => ({queues: {}}));
    jest.useRealTimers();
  });

  function analyzeTexts(): string[] {
    const {renderer, unmount} = render(
      <UploadToast mode="analyze" albumId={albumId} />,
    );
    const texts = renderer.root
      .findAllByType(Text)
      .map(node => String(node.props.children));
    unmount();
    return texts;
  }

  it('hides the estimate before enough photos finished', () => {
    beginAnalysisQueue(albumId, 100);
    mockAnalysisCounts = {total: 100, pending: 99, inProgress: 1, completed: 0, failed: 0};
    expect(analyzeTexts()).toContain('Analyzing 100 photos');
  });

  it('shows About X min left once the pace is known', () => {
    jest.useFakeTimers().setSystemTime(0);
    beginAnalysisQueue(albumId, 1000);
    mockAnalysisCounts = {total: 1000, pending: 1000, inProgress: 0, completed: 0, failed: 0};
    const {renderer, unmount, rerender} = render(
      <UploadToast mode="analyze" albumId={albumId} />,
    );
    jest.setSystemTime(10000);
    mockAnalysisCounts = {total: 1000, pending: 890, inProgress: 0, completed: 110, failed: 0};
    rerender(<UploadToast mode="analyze" albumId={albumId} />);
    const texts = renderer.root.findAllByType(Text).map(n => String(n.props.children));
    unmount();
    expect(texts.some(t => /· About \d+ min left$/.test(t))).toBe(true);
  });
});
