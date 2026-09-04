import {
  createCullingPhotoId,
  photoIdFromStoredFile,
} from '../src/lib/culling/cullingPhotoId';
import {makeUploadFile} from './helpers/fixtures';

describe('cullingPhotoId', () => {
  it('creates unique UUID-shaped ids', () => {
    const first = createCullingPhotoId();
    const second = createCullingPhotoId();
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(first).not.toBe(second);
  });

  it('uses the stored filename stem', () => {
    expect(photoIdFromStoredFile(makeUploadFile({name: 'IMG_1001.JPG'}))).toBe(
      'IMG_1001',
    );
    expect(photoIdFromStoredFile(makeUploadFile({name: 'noext'}))).toBe('noext');
  });
});
