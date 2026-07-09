import 'reflect-metadata';
import {container} from 'tsyringe';
import {IPhotoRepository} from '../domain/repositories/IPhotoRepository';
import {IAlbumRepository} from '../domain/repositories/IAlbumRepository';
import {SQLitePhotoRepository} from '../infrastructure/repositories/SQLitePhotoRepository';
import {SQLiteAlbumRepository} from '../infrastructure/repositories/SQLiteAlbumRepository';
import {getSQLiteAdapter} from '../infrastructure/storage';
import {AnalyzePhotoUseCase} from '../application/useCases/AnalyzePhotoUseCase';
import {ImportPhotosUseCase} from '../application/useCases/ImportPhotosUseCase';
import {UploadSelectedPhotosUseCase} from '../application/useCases/UploadSelectedPhotosUseCase';
import {TOKENS} from './tokens';

let dependencyInjectionInitialized = false;

export function setupDependencyInjection(): void {
  if (dependencyInjectionInitialized) {
    return;
  }
  dependencyInjectionInitialized = true;

  const sqliteAdapter = getSQLiteAdapter();
  const photoRepo = new SQLitePhotoRepository(sqliteAdapter);
  const albumRepo = new SQLiteAlbumRepository(sqliteAdapter);

  container.register<IPhotoRepository>(TOKENS.IPhotoRepository, {
    useValue: photoRepo,
  });

  container.register<IAlbumRepository>(TOKENS.IAlbumRepository, {
    useValue: albumRepo,
  });

  container.register(AnalyzePhotoUseCase, {
    useValue: new AnalyzePhotoUseCase(photoRepo, albumRepo),
  });
  container.register(ImportPhotosUseCase, {
    useValue: new ImportPhotosUseCase(),
  });
  container.register(UploadSelectedPhotosUseCase, {
    useValue: new UploadSelectedPhotosUseCase(photoRepo, albumRepo),
  });
}

export {container};
