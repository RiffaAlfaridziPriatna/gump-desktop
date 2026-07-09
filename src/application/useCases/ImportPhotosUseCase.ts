import {
  syncPhotoFromStoreNow,
  syncPhotosFromStore,
} from '../syncPhotoRepository';
import {injectable} from 'tsyringe';

@injectable()
export class ImportPhotosUseCase {
  syncFromStore(albumId: string, photoId: string): void {
    syncPhotoFromStoreNow(albumId, photoId);
  }

  syncManyFromStore(albumId: string, photoIds: string[]): void {
    syncPhotosFromStore(albumId, photoIds);
  }

  markUploading(_albumId: string, _photoId: string, _progress: number): void {
    // Local import progress lives in memory; persist only on uploaded/failed.
  }

  markUploaded(_albumId: string, _photoId: string): void {
    // Photo rows are flushed in upload queue batches.
  }

  markUploadFailed(_albumId: string, _photoId: string, _error: string): void {
    // Photo rows are flushed in upload queue batches.
  }
}
