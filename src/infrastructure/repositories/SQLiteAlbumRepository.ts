import {IAlbumRepository} from '../../domain/repositories/IAlbumRepository';
import {CulledAlbum} from '../../domain/entities/CulledAlbum';
import {SQLiteAdapter} from '../storage/SQLiteAdapter';

export class SQLiteAlbumRepository implements IAlbumRepository {
  constructor(private adapter: SQLiteAdapter) {}

  save(album: CulledAlbum): void {
    const data = JSON.stringify(album.toPlain());
    this.adapter.saveAlbum(album.albumId, data);
  }

  findById(albumId: string): CulledAlbum | null {
    const data = this.adapter.loadAlbum(albumId);
    if (!data) return null;

    try {
      const plain = JSON.parse(data);
      return CulledAlbum.fromPlain(plain);
    } catch (error) {
      console.error('Failed to parse album data:', error);
      return null;
    }
  }

  findAll(): CulledAlbum[] {
    const albumIds = this.adapter.listAlbumIds();
    return albumIds
      .map(albumId => this.findById(albumId))
      .filter((album): album is CulledAlbum => album !== null);
  }

  findAllIds(): string[] {
    return this.adapter.listAlbumIds();
  }

  delete(albumId: string): void {
    this.adapter.deleteAlbum(albumId);
    this.adapter.deletePhotosByAlbum(albumId);
  }

  exists(albumId: string): boolean {
    return this.findById(albumId) !== null;
  }
}
