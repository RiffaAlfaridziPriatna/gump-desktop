import {CulledPhoto} from '../entities/CulledPhoto';
import {AnalysisStatus, UploadStatus} from '../valueObjects/Status';

export interface IPhotoRepository {
  save(photo: CulledPhoto): Promise<void>;
  saveMany(photos: CulledPhoto[]): Promise<void>;
  findById(albumId: string, photoId: string): CulledPhoto | null;
  findByAlbum(albumId: string): CulledPhoto[];
  findPhotoIds(albumId: string): string[];
  delete(albumId: string, photoId: string): Promise<void>;
  deleteByAlbum(albumId: string): Promise<void>;
  countByAlbum(albumId: string): number;
  sumFileSizeByAlbum(albumId: string): number;
  countByUploadStatus(albumId: string, status: UploadStatus): number;
  countByAnalysisStatus(albumId: string, status: AnalysisStatus): number;
}
