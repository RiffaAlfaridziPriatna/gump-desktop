import type {IPhotoRepository} from '../../domain/repositories/IPhotoRepository';
import type {IAlbumRepository} from '../../domain/repositories/IAlbumRepository';
import {Face} from '../../domain/valueObjects/Face';
import {
  syncPhotoFromStore,
  syncPhotosFromStore,
} from '../syncPhotoRepository';
import {inject, injectable} from 'tsyringe';

@injectable()
export class AnalyzePhotoUseCase {
  constructor(
    @inject('IPhotoRepository') private photoRepo: IPhotoRepository,
    @inject('IAlbumRepository') private albumRepo: IAlbumRepository,
  ) {}

  syncFromStore(albumId: string, photoId: string): void {
    syncPhotoFromStore(albumId, photoId);
  }

  async execute(
    albumId: string,
    photoId: string,
    faces: Face[],
    aiFlags: {
      aiSelected: boolean;
      maybe: boolean;
      blurred: boolean;
      closedEyes: boolean;
    },
  ): Promise<void> {
    const photo = this.photoRepo.findById(albumId, photoId);
    if (!photo) {
      throw new Error(`Photo not found: ${photoId}`);
    }

    photo.markAnalyzed(faces, aiFlags);
    this.photoRepo.save(photo);
  }

  startAnalysis(albumId: string, photoId: string): void {
    syncPhotoFromStore(albumId, photoId);
  }

  updateProgress(albumId: string, photoId: string, _progress: number): void {
    syncPhotoFromStore(albumId, photoId);
  }

  markFailed(albumId: string, photoId: string, _error: string): void {
    syncPhotoFromStore(albumId, photoId);
  }

  markAnalyzed(albumId: string, photoId: string): void {
    syncPhotoFromStore(albumId, photoId);
  }
}
