import React from 'react';
import {Text} from 'react-native';
import {UploadToast} from '../../src/components/upload/UploadToast';
import {
  beginServerUploadQueue,
  finishServerUploadQueue,
  uploadQueueStore,
} from '../../src/lib/culledAlbum/uploadQueueStore';
import {render} from '../helpers/render';

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
  useCulledAlbumAnalysisCounts: () => null,
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
