jest.mock('../src/application/syncPhotoRepository', () => ({
  syncPhotoFromStore: jest.fn(),
  syncPhotosFromStore: jest.fn(),
  syncPhotoFromStoreNow: jest.fn(),
}));

import {AnalyzePhotoUseCase} from '../src/application/useCases/AnalyzePhotoUseCase';
import {ImportPhotosUseCase} from '../src/application/useCases/ImportPhotosUseCase';
import {UploadSelectedPhotosUseCase} from '../src/application/useCases/UploadSelectedPhotosUseCase';
import {
  syncPhotoFromStore,
  syncPhotoFromStoreNow,
  syncPhotosFromStore,
} from '../src/application/syncPhotoRepository';
import {
  InMemoryAlbumRepository,
  InMemoryPhotoRepository,
} from './helpers/inMemoryRepos';
import {makeDomainFace, makeDomainPhoto} from './helpers/fixtures';

describe('AnalyzePhotoUseCase', () => {
  it('marks a photo analyzed and persists it', async () => {
    const photos = new InMemoryPhotoRepository();
    const albums = new InMemoryAlbumRepository();
    const photo = makeDomainPhoto({photoId: 'p1', albumId: 'a1'});
    await photos.save(photo);

    const useCase = new AnalyzePhotoUseCase(photos, albums);
    await useCase.execute('a1', 'p1', [makeDomainFace()], {
      aiSelected: true,
      maybe: false,
      blurred: false,
      closedEyes: false,
    });

    const saved = photos.findById('a1', 'p1');
    expect(saved?.analysisStatus).toBe('analyzed');
    expect(saved?.aiSelected).toBe(true);
    expect(saved?.faces).toHaveLength(1);
  });

  it('throws when the photo is missing', async () => {
    const useCase = new AnalyzePhotoUseCase(
      new InMemoryPhotoRepository(),
      new InMemoryAlbumRepository(),
    );
    await expect(
      useCase.execute('a1', 'missing', [], {
        aiSelected: false,
        maybe: false,
        blurred: false,
        closedEyes: false,
      }),
    ).rejects.toThrow('Photo not found: missing');
  });

  it('syncs store-backed progress helpers', () => {
    const useCase = new AnalyzePhotoUseCase(
      new InMemoryPhotoRepository(),
      new InMemoryAlbumRepository(),
    );
    useCase.startAnalysis('a1', 'p1');
    useCase.updateProgress('a1', 'p1', 40);
    useCase.markFailed('a1', 'p1', 'boom');
    useCase.markAnalyzed('a1', 'p1');
    expect(syncPhotoFromStore).toHaveBeenCalledTimes(4);
  });
});

describe('UploadSelectedPhotosUseCase', () => {
  it('returns only selected photo ids', async () => {
    const photos = new InMemoryPhotoRepository();
    const selected = makeDomainPhoto({photoId: 'keep', albumId: 'a1'});
    selected.toggleSelection();
    await photos.save(selected);
    await photos.save(makeDomainPhoto({photoId: 'skip', albumId: 'a1'}));
    await photos.save(makeDomainPhoto({photoId: 'other', albumId: 'a2'}));

    const useCase = new UploadSelectedPhotosUseCase(
      photos,
      new InMemoryAlbumRepository(),
    );
    expect(useCase.execute('a1')).toEqual(['keep']);
  });
});

describe('ImportPhotosUseCase', () => {
  it('forwards store sync calls', () => {
    const useCase = new ImportPhotosUseCase();
    useCase.syncFromStore('a1', 'p1');
    useCase.syncManyFromStore('a1', ['p1', 'p2']);
    useCase.markUploading('a1', 'p1', 10);
    useCase.markUploaded('a1', 'p1');
    useCase.markUploadFailed('a1', 'p1', 'nope');
    expect(syncPhotoFromStoreNow).toHaveBeenCalledWith('a1', 'p1');
    expect(syncPhotosFromStore).toHaveBeenCalledWith('a1', ['p1', 'p2']);
  });
});
