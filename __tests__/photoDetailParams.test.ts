import {photoDetailParams} from '../src/lib/culledAlbum/photoDetailParams';

describe('photoDetailParams', () => {
  it('opens the tapped photo with the current grid order only', () => {
    expect(photoDetailParams('album-1', 'b', ['a', 'b', 'c'])).toEqual({
      albumId: 'album-1',
      photoId: 'b',
      photoIds: ['a', 'b', 'c'],
    });
  });

  it('adds faceIndex only when given, including zero', () => {
    expect(photoDetailParams('album-1', 'b', ['b'], 0)).toEqual({
      albumId: 'album-1',
      photoId: 'b',
      photoIds: ['b'],
      faceIndex: 0,
    });
    expect(photoDetailParams('album-1', 'b', ['b'])).not.toHaveProperty(
      'faceIndex',
    );
  });
});
