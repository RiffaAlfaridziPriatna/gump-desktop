import {CulledAlbum} from '../entities/CulledAlbum';

export interface IAlbumRepository {
  save(album: CulledAlbum): void;
  findById(albumId: string): CulledAlbum | null;
  findAll(): CulledAlbum[];
  findAllIds(): string[];
  delete(albumId: string): void;
  exists(albumId: string): boolean;
}
