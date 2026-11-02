import {selectPreviewPhoto} from '../src/lib/culledAlbum/selectPreviewPhoto';

const a = {photoId: 'a'};
const b = {photoId: 'b'};
const c = {photoId: 'c'};

describe('selectPreviewPhoto', () => {
  it('prefers the focused photo', () => {
    expect(selectPreviewPhoto([a, b, c], c, 'b')).toBe(c);
  });
  it('uses the first photo in grid order', () => {
    expect(selectPreviewPhoto([a, b, c], undefined, 'b')).toBe(b);
  });
  it('falls back to the first album photo', () => {
    expect(selectPreviewPhoto([a, b], undefined, 'zzz')).toBe(a);
    expect(selectPreviewPhoto([a, b], undefined, undefined)).toBe(a);
    expect(selectPreviewPhoto([], undefined, undefined)).toBeUndefined();
  });
});
