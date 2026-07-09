import {CulledPhoto} from '../entities/CulledPhoto';
import {AnalysisStatus, UploadStatus} from '../valueObjects/Status';

export interface IPhotoRepository {
  save(photo: CulledPhoto): void;
  saveMany(photos: CulledPhoto[]): void;
  findById(albumId: string, photoId: string): CulledPhoto | null;
  findByAlbum(albumId: string): CulledPhoto[];
  findPhotoIds(albumId: string): string[];
  delete(albumId: string, photoId: string): void;
  deleteByAlbum(albumId: string): void;
  countByAlbum(albumId: string): number;
  sumFileSizeByAlbum(albumId: string): number;
  countByUploadStatus(albumId: string, status: UploadStatus): number;
  countByAnalysisStatus(albumId: string, status: AnalysisStatus): number;
}
