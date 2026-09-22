import {partitionFilesByFilename} from '../src/lib/culledAlbum/filenameDuplicates';
import {FileAsset} from '../src/services/upload/types';

function makeFile(name: string, uri = `file:///${name}`): FileAsset {
  return {
    uri,
    name,
    type: 'image/jpeg',
    size: 1000,
  };
}

describe('partitionFilesByFilename', () => {
  it('accepts all files when names are unique and album is empty', () => {
    const files = [makeFile('a.jpg'), makeFile('b.jpg')];
    const result = partitionFilesByFilename(new Set(), files);
    expect(result.accepted).toEqual(files);
    expect(result.rejectedNames).toEqual([]);
  });

  it('rejects files whose name already exists in the album', () => {
    const files = [makeFile('a.jpg'), makeFile('b.jpg')];
    const result = partitionFilesByFilename(new Set(['a.jpg']), files);
    expect(result.accepted.map(file => file.name)).toEqual(['b.jpg']);
    expect(result.rejectedNames).toEqual(['a.jpg']);
  });

  it('keeps the first file and rejects later duplicates within the same pick', () => {
    const first = makeFile('dup.jpg', 'file:///first');
    const second = makeFile('dup.jpg', 'file:///second');
    const third = makeFile('other.jpg');
    const result = partitionFilesByFilename(new Set(), [first, second, third]);
    expect(result.accepted).toEqual([first, third]);
    expect(result.rejectedNames).toEqual(['dup.jpg']);
  });

  it('is exact and case-sensitive', () => {
    const files = [makeFile('Photo.JPG'), makeFile('photo.jpg')];
    const result = partitionFilesByFilename(new Set(['Photo.JPG']), files);
    expect(result.accepted.map(file => file.name)).toEqual(['photo.jpg']);
    expect(result.rejectedNames).toEqual(['Photo.JPG']);
  });

  it('rejects every file when all names collide', () => {
    const files = [makeFile('a.jpg'), makeFile('a.jpg')];
    const result = partitionFilesByFilename(new Set(['a.jpg']), files);
    expect(result.accepted).toEqual([]);
    expect(result.rejectedNames).toEqual(['a.jpg', 'a.jpg']);
  });

  it('returns empty lists for an empty pick', () => {
    const result = partitionFilesByFilename(new Set(['a.jpg']), []);
    expect(result.accepted).toEqual([]);
    expect(result.rejectedNames).toEqual([]);
  });
});
