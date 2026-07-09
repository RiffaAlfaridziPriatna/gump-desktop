import {container} from './container';
import {AnalyzePhotoUseCase} from '../application/useCases/AnalyzePhotoUseCase';
import {ImportPhotosUseCase} from '../application/useCases/ImportPhotosUseCase';
import {UploadSelectedPhotosUseCase} from '../application/useCases/UploadSelectedPhotosUseCase';

export type CulledAlbumUseCases = {
  analyzePhoto: AnalyzePhotoUseCase;
  importPhotos: ImportPhotosUseCase;
  uploadSelectedPhotos: UploadSelectedPhotosUseCase;
};

export function resolveUseCases(): CulledAlbumUseCases {
  return {
    analyzePhoto: container.resolve(AnalyzePhotoUseCase),
    importPhotos: container.resolve(ImportPhotosUseCase),
    uploadSelectedPhotos: container.resolve(UploadSelectedPhotosUseCase),
  };
}
