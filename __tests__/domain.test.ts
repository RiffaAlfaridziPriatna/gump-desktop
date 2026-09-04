import {AlbumCover, CulledAlbum} from '../src/domain/entities/CulledAlbum';
import {CulledPhoto} from '../src/domain/entities/CulledPhoto';
import {
  Face,
  FaceBounds,
  FaceLandmark,
  FacePose,
} from '../src/domain/valueObjects/Face';
import {FileAsset} from '../src/domain/valueObjects/FileAsset';
import {
  makeDomainAlbum,
  makeDomainFace,
  makeDomainFile,
  makeDomainPhoto,
} from './helpers/fixtures';

describe('FileAsset', () => {
  it('round-trips through plain data', () => {
    const file = makeDomainFile({
      name: 'hero.jpg',
      thumbnailUri: 'file:///thumb.jpg',
    });
    expect(FileAsset.fromPlain(file.toPlain()).name).toBe('hero.jpg');
    expect(FileAsset.fromPlain(file.toPlain()).thumbnailUri).toBe(
      'file:///thumb.jpg',
    );
  });
});

describe('Face', () => {
  it('accepts both boundingBox and rekognitionFaceId API shapes', () => {
    const face = Face.fromPlain({
      rekognitionFaceId: 'cluster-9',
      boundingBox: {left: 0.1, top: 0.2, width: 0.3, height: 0.4},
      eyesOpen: {value: 'open', confidence: 88},
      pose: {pitch: 1, roll: 2, yaw: 3},
      landmarks: [{type: 'nose', x: 0.2, y: 0.3}],
      sharpness: '70',
    });

    expect(face.clusterId).toBe('cluster-9');
    expect(face.bounds).toEqual(
      new FaceBounds({left: 0.1, top: 0.2, width: 0.3, height: 0.4}),
    );
    expect(face.toPlain()).toMatchObject({
      rekognitionFaceId: 'cluster-9',
      sharpness: 70,
      pose: {pitch: 1, roll: 2, yaw: 3},
    });
  });

  it('copies landmarks and pose value objects', () => {
    const face = makeDomainFace({
      landmarks: [new FaceLandmark({type: 'eyeLeft', x: 1, y: 2})],
      pose: new FacePose({pitch: 4, roll: 5, yaw: 6}),
    });
    expect(face.landmarks[0]?.toPlain()).toEqual({type: 'eyeLeft', x: 1, y: 2});
  });
});

describe('CulledPhoto', () => {
  it('starts idle and tracks upload / analysis / selection transitions', () => {
    const photo = makeDomainPhoto();
    expect(photo.isUploadInFlight()).toBe(true);
    expect(photo.isAnalysisInFlight()).toBe(false);

    photo.markUploading(40);
    expect(photo.status).toBe('uploading');
    photo.markUploaded();
    expect(photo.status).toBe('uploaded');
    expect(photo.progress).toBe(100);

    photo.startAnalysis();
    expect(photo.isAnalysisInFlight()).toBe(true);
    photo.updateAnalysisProgress(150);
    expect(photo.analysisProgress).toBe(100);
    photo.markAnalyzed([makeDomainFace()], {
      aiSelected: true,
      maybe: false,
      blurred: false,
      closedEyes: false,
    }, 'scrfd-ocec-15');
    expect(photo.analysisStatus).toBe('analyzed');
    expect(photo.aiSelected).toBe(true);
    expect(photo.analysisEngineVersion).toBe('scrfd-ocec-15');

    photo.toggleSelection();
    photo.setStarRating(5);
    photo.markAsDuplicate();
    expect(photo.selected).toBe(true);
    expect(photo.starRating).toBe(5);
    expect(photo.duplicated).toBe(true);

    photo.startServerUpload();
    photo.markServerUploaded();
    expect(photo.serverUploadStatus).toBe('uploaded');
  });

  it('round-trips through plain data including faces', () => {
    const photo = makeDomainPhoto({photoId: 'p9'});
    photo.markAnalyzed([makeDomainFace({faceId: 'f1'})], {
      aiSelected: false,
      maybe: true,
      blurred: false,
      closedEyes: false,
    });
    const restored = CulledPhoto.fromPlain('album-1', photo.toPlain());
    expect(restored.photoId).toBe('p9');
    expect(restored.maybe).toBe(true);
    expect(restored.faces).toHaveLength(1);
  });

  it('records upload and analysis failures', () => {
    const photo = makeDomainPhoto();
    photo.markUploadFailed('disk full');
    photo.markAnalysisFailed('onnx missing');
    photo.markServerUploadFailed('network');
    expect(photo.status).toBe('failed');
    expect(photo.analysisStatus).toBe('failed');
    expect(photo.serverUploadStatus).toBe('failed');
    expect(photo.error).toBe('disk full');
  });
});

describe('CulledAlbum', () => {
  it('mutates culling summary and cluster ids', () => {
    const album = makeDomainAlbum();
    expect(album.incrementFaceClusterId()).toBe(0);
    expect(album.nextFaceClusterId).toBe(1);
    album.markCullingCompleted();
    album.markHasUploads();
    album.setCullingSummary({totalPhotos: 2}, [{faceId: 'f'}]);
    album.setCullingDuplicateGroups([{groupId: 'g'}]);
    album.setLastCullFilters({aiSelected: true});
    album.updateTotals(4, 100);
    album.updateSyncedData(8, 1.5);
    expect(album.cullingCompleted).toBe(true);
    expect(album.totalPhotos).toBe(4);
    expect(album.syncedStorageGb).toBe(1.5);
  });

  it('accepts either albumId or id when restoring from plain data', () => {
    const album = CulledAlbum.fromPlain({
      id: 'legacy',
      name: 'Old',
      cover: {thumbnail: 't'},
      coverMobile: null,
      link: '/a',
    });
    expect(album.albumId).toBe('legacy');
    expect(AlbumCover.fromPlain(null).thumbnail).toBeNull();
    expect(album.toPlain().name).toBe('Old');
  });
});
