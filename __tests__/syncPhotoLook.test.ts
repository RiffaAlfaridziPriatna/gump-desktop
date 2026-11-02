import {createCulledAlbumFromSelection} from '../src/lib/culledAlbum/types';
import {syncAlbumWithDisk} from '../src/lib/culledAlbum/sync';
import {photoStateStore} from '../src/lib/culledAlbum/photoStateStore';

jest.mock('@lib/storage/localStorage', () => ({
  listAlbumPhotos: jest.fn(async () => [
    {uri: 'file:///x/a.jpg', name: 'a.jpg', type: 'image/jpeg', size: 1},
  ]),
}));
jest.mock('../src/lib/culledAlbum/storage', () => ({saveAlbum: jest.fn()}));
jest.mock('../src/lib/culledAlbum/photoLoader', () => ({
  setPhotoOrder: jest.fn(),
}));

describe('syncAlbumWithDisk look', () => {
  it('merged disk photos stay original despite album default', async () => {
    photoStateStore.setState(() => ({photoState: {}, photoOrder: {}}));
    // Partial API source: the factory only reads the listed fields.
    const album = createCulledAlbumFromSelection({
      id: 'album-1',
      name: 'a',
      title: null,
      cover: null,
      coverMobile: null,
      link: '',
    } as never);
    album.defaultLookId = 'warmRomantic';
    const result = await syncAlbumWithDisk(album, []);
    expect(result.album.photos).toHaveLength(1);
    expect(result.album.photos[0]!.lookId).toBe('original');
    expect(result.album.photos[0]!.status).toBe('uploaded');
  });
});
