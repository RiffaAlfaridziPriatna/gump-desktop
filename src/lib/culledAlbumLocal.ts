import {
  addPhoto,
  LocalPhotoRecord,
  removePhotosByAlbum as removeStoredPhotosByAlbum,
} from './culledAlbumLocalStorage';
import {recordPhotoAdded, recordPhotosRemoved} from './culledAlbumLocalStats';

export type {LocalPhotoRecord} from './culledAlbumLocalStorage';
export {getPhotosByAlbum, toFileAsset} from './culledAlbumLocalStorage';
export {formatStorageSizeGb} from './culledAlbumLocalStats';

export async function addLocalPhoto(record: LocalPhotoRecord): Promise<void> {
  await addPhoto(record);
  recordPhotoAdded(record);
}

export async function removePhotosByAlbum(albumId: string): Promise<void> {
  await removeStoredPhotosByAlbum(albumId);
  recordPhotosRemoved(albumId);
}
