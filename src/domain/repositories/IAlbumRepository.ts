import {CulledAlbum} from '../entities/CulledAlbum';

export interface IAlbumRepository {
  save(album: CulledAlbum): Promise<void>;
  findById(albumId: string): CulledAlbum | null;
  findAll(): CulledAlbum[];
  findAllIds(): string[];
  delete(albumId: string): Promise<void>;
  exists(albumId: string): boolean;
}
