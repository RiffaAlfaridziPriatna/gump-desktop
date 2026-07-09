import {IPhotoRepository} from '../../domain/repositories/IPhotoRepository';
import {CulledPhoto} from '../../domain/entities/CulledPhoto';
import {AnalysisStatus, UploadStatus} from '../../domain/valueObjects/Status';
import {SQLiteAdapter} from '../storage/SQLiteAdapter';

export class SQLitePhotoRepository implements IPhotoRepository {
  constructor(private adapter: SQLiteAdapter) {}

  save(photo: CulledPhoto): void {
    const data = JSON.stringify(photo.toPlain());
    this.adapter.savePhoto(photo.albumId, photo.photoId, data);
  }

  saveMany(photos: CulledPhoto[]): void {
    if (photos.length === 0) return;

    const albumId = photos[0]!.albumId;
    const photoData = photos.map(photo => ({
      photoId: photo.photoId,
      data: JSON.stringify(photo.toPlain()),
    }));

    this.adapter.savePhotos(albumId, photoData);
  }

  findById(albumId: string, photoId: string): CulledPhoto | null {
    const data = this.adapter.loadPhoto(albumId, photoId);
    if (!data) return null;

    try {
      const plain = JSON.parse(data);
      return CulledPhoto.fromPlain(albumId, plain);
    } catch (error) {
      console.error('Failed to parse photo data:', error);
      return null;
    }
  }

  findByAlbum(albumId: string): CulledPhoto[] {
    const photoIds = this.adapter.loadPhotoIds(albumId);
    if (photoIds.length === 0) return [];

    const photoData = this.adapter.loadPhotos(albumId, photoIds);
    return photoData
      .map(item => {
        try {
          const plain = JSON.parse(item.data);
          return CulledPhoto.fromPlain(albumId, plain);
        } catch (error) {
          console.error('Failed to parse photo data:', error);
          return null;
        }
      })
      .filter((photo): photo is CulledPhoto => photo !== null);
  }

  findPhotoIds(albumId: string): string[] {
    return this.adapter.loadPhotoIds(albumId);
  }

  delete(albumId: string, photoId: string): void {
    this.adapter.deletePhoto(albumId, photoId);
  }

  deleteByAlbum(albumId: string): void {
    this.adapter.deletePhotosByAlbum(albumId);
  }

  countByAlbum(albumId: string): number {
    return this.adapter.countPhotos(albumId);
  }

  sumFileSizeByAlbum(albumId: string): number {
    return this.adapter.sumPhotoFileSizeByAlbum(albumId);
  }

  countByUploadStatus(albumId: string, status: UploadStatus): number {
    return this.adapter.countByStatus(albumId, 'status', status);
  }

  countByAnalysisStatus(albumId: string, status: AnalysisStatus): number {
    return this.adapter.countByStatus(albumId, 'analysisStatus', status);
  }
}
