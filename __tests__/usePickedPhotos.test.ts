import {derivePickedSets} from '../src/hooks/usePickedPhotos';
import {makeCulledAlbumPhoto} from './helpers/fixtures';

const photo = (
  photoId: string,
  over: Partial<Parameters<typeof makeCulledAlbumPhoto>[0]> = {},
) => makeCulledAlbumPhoto({photoId, selected: true, ...over});

describe('derivePickedSets', () => {
  it('picked ignores filters and excludes unpicked, unanalyzed and import-pending photos', () => {
    const {picked} = derivePickedSets([
      photo('a'),
      photo('b', {selected: false}),
      photo('c', {analysisStatus: 'pending'}),
      photo('d', {status: 'pending'}),
      photo('e', {closedEyes: true}),
    ]);
    expect(picked.map(p => p.photoId)).toEqual(['a', 'e']);
  });

  it('pending drops photos already on the server', () => {
    const {picked, pending} = derivePickedSets([
      photo('a'),
      photo('b', {serverUploadStatus: 'uploaded'}),
      photo('c', {serverUploadStatus: 'failed'}),
    ]);
    expect(picked.map(p => p.photoId)).toEqual(['a', 'b', 'c']);
    expect(pending.map(p => p.photoId)).toEqual(['a', 'c']);
  });

  it('pending is empty when every picked photo is already uploaded', () => {
    const {picked, pending} = derivePickedSets([
      photo('a', {serverUploadStatus: 'uploaded'}),
    ]);
    expect(picked).toHaveLength(1);
    expect(pending).toHaveLength(0);
  });
});
