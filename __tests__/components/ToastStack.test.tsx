import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AiSelectionToast } from '../../src/components/culling/AiSelectionToast';
import { UploadToast } from '../../src/components/upload/UploadToast';
import {
  beginServerUploadQueue,
  finishServerUploadQueue,
  uploadQueueStore,
} from '../../src/lib/culledAlbum/uploadQueueStore';
import { render } from '../helpers/render';

const mockPhotos = [{ id: 'u0', serverUploadStatus: 'uploaded' }];

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

describe('toast stacking', () => {
  afterEach(() => {
    uploadQueueStore.setState(() => ({ queues: {} }));
  });

  it('AI toast renders above a visible upload toast and neither is absolute', () => {
    beginServerUploadQueue(albumId, 1);
    finishServerUploadQueue(albumId, {
      status: 'completed',
      uploadedCount: 1,
      failedCount: 0,
    });
    const { renderer, unmount } = render(
      <View>
        <AiSelectionToast
          variant="updated"
          level="more"
          count={3}
          onDismiss={jest.fn()}
        />
        <UploadToast mode="serverUpload" albumId={albumId} />
      </View>,
    );
    const texts = renderer.root
      .findAllByType(Text)
      .map(t => String(t.props.children));
    const aiIndex = texts.indexOf('Recommendations updated · More');
    const uploadIndex = texts.indexOf('Uploaded 1 photos to server');
    expect(aiIndex).toBeGreaterThanOrEqual(0);
    expect(uploadIndex).toBeGreaterThan(aiIndex);
    const positions = renderer.root
      .findAllByType(View)
      .map(v => StyleSheet.flatten(v.props.style)?.position);
    expect(positions).not.toContain('absolute');
    unmount();
  });
});
