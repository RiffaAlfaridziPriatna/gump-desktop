import {IAlbumRepository} from '../../src/domain/repositories/IAlbumRepository';
import {IPhotoRepository} from '../../src/domain/repositories/IPhotoRepository';
import {CulledAlbum} from '../../src/domain/entities/CulledAlbum';
import {CulledPhoto} from '../../src/domain/entities/CulledPhoto';
import {AnalysisStatus, UploadStatus} from '../../src/domain/valueObjects/Status';

function photoKey(albumId: string, photoId: string): string {
  return `${albumId}:${photoId}`;
}

export class InMemoryPhotoRepository implements IPhotoRepository {
  private readonly photos = new Map<string, CulledPhoto>();

  async save(photo: CulledPhoto): Promise<void> {
    this.photos.set(photoKey(photo.albumId, photo.photoId), photo);
  }

  async saveMany(photos: CulledPhoto[]): Promise<void> {
    for (const photo of photos) {
      await this.save(photo);
    }
  }

  findById(albumId: string, photoId: string): CulledPhoto | null {
    return this.photos.get(photoKey(albumId, photoId)) ?? null;
  }

  findByAlbum(albumId: string): CulledPhoto[] {
    return [...this.photos.values()].filter(photo => photo.albumId === albumId);
  }

  findPhotoIds(albumId: string): string[] {
    return this.findByAlbum(albumId).map(photo => photo.photoId);
  }

  async delete(albumId: string, photoId: string): Promise<void> {
    this.photos.delete(photoKey(albumId, photoId));
  }

  async deleteByAlbum(albumId: string): Promise<void> {
    for (const photo of this.findByAlbum(albumId)) {
      this.photos.delete(photoKey(albumId, photo.photoId));
    }
  }

  countByAlbum(albumId: string): number {
    return this.findByAlbum(albumId).length;
  }

  sumFileSizeByAlbum(albumId: string): number {
    return this.findByAlbum(albumId).reduce(
      (total, photo) => total + photo.file.size,
      0,
    );
  }

  countByUploadStatus(albumId: string, status: UploadStatus): number {
    return this.findByAlbum(albumId).filter(photo => photo.status === status)
      .length;
  }

  countByAnalysisStatus(albumId: string, status: AnalysisStatus): number {
    return this.findByAlbum(albumId).filter(
      photo => photo.analysisStatus === status,
    ).length;
  }
}

export class InMemoryAlbumRepository implements IAlbumRepository {
  private readonly albums = new Map<string, CulledAlbum>();

  async save(album: CulledAlbum): Promise<void> {
    this.albums.set(album.albumId, album);
  }

  findById(albumId: string): CulledAlbum | null {
    return this.albums.get(albumId) ?? null;
  }

  findAll(): CulledAlbum[] {
    return [...this.albums.values()];
  }

  findAllIds(): string[] {
    return [...this.albums.keys()];
  }

  async delete(albumId: string): Promise<void> {
    this.albums.delete(albumId);
  }

  exists(albumId: string): boolean {
    return this.albums.has(albumId);
  }
}
