import {resolveUploadFileAsset} from '../src/lib/culledAlbum/resolveUploadFileAsset';
import {makeCulledAlbumPhoto, makeUploadFile} from './helpers/fixtures';

describe('resolveUploadFileAsset', () => {
  const photo = makeCulledAlbumPhoto({
    photoId: 'photo-1',
    file: makeUploadFile({
      uri: 'file:///tmp/original.nef',
      name: 'IMG_001.NEF',
      size: 25_000_000,
      type: 'image/x-nikon-nef',
    }),
  });

  it('returns the original file when no bake is present', () => {
    expect(resolveUploadFileAsset(photo)).toBe(photo.file);
    expect(resolveUploadFileAsset(photo, null)).toBe(photo.file);
    expect(resolveUploadFileAsset(photo, {uri: '', size: 100})).toBe(photo.file);
    expect(resolveUploadFileAsset(photo, {uri: 'file:///tmp/baked.jpg', size: 0})).toBe(
      photo.file,
    );
  });

  it('uses the baked JPEG uri and byte size for multipart upload', () => {
    const baked = {
      uri: 'file:///tmp/looks/photo-1-warmRomantic-100-12000.jpg',
      size: 4_200_000,
    };

    expect(resolveUploadFileAsset(photo, baked)).toEqual({
      ...photo.file,
      uri: baked.uri,
      name: 'IMG_001.jpg',
      type: 'image/jpeg',
      size: baked.size,
    });
  });
});
