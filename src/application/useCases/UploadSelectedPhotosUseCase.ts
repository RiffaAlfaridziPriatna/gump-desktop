import type {IPhotoRepository} from '../../domain/repositories/IPhotoRepository';
import type {IAlbumRepository} from '../../domain/repositories/IAlbumRepository';
import {syncPhotoFromStore} from '../syncPhotoRepository';
import {inject, injectable} from 'tsyringe';

@injectable()
export class UploadSelectedPhotosUseCase {
  constructor(
    @inject('IPhotoRepository') private photoRepo: IPhotoRepository,
    @inject('IAlbumRepository') private albumRepo: IAlbumRepository,
  ) {}

  execute(albumId: string): string[] {
    const allPhotos = this.photoRepo.findByAlbum(albumId);
    return allPhotos.filter(photo => photo.selected).map(photo => photo.photoId);
  }

  syncFromStore(albumId: string, photoId: string): void {
    syncPhotoFromStore(albumId, photoId);
  }

  startUpload(albumId: string, photoId: string): void {
    syncPhotoFromStore(albumId, photoId);
  }

  updateProgress(albumId: string, photoId: string, _progress: number): void {
    syncPhotoFromStore(albumId, photoId);
  }

  markUploaded(albumId: string, photoId: string): void {
    syncPhotoFromStore(albumId, photoId);
  }

  markFailed(albumId: string, photoId: string, _error: string): void {
    syncPhotoFromStore(albumId, photoId);
  }
}
