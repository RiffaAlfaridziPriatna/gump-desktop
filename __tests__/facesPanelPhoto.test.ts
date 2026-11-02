import {toFacesPanelPhoto} from '../src/lib/culling/facesPanelPhoto';

describe('toFacesPanelPhoto', () => {
  it('maps faces and falls back to an index-based id', () => {
    const box = {left: 0, top: 0, width: 1, height: 1};
    const photo = {
      photoId: 'p1',
      file: {name: 'a.jpg', uri: 'file:///a.jpg'},
      faces: [
        {rekognitionFaceId: 'r1', boundingBox: box, eyeStatus: 'open', focusLevel: 'good'},
        {boundingBox: box, eyeStatus: 'closed', focusLevel: 'soft'},
      ],
    } as never;
    const out = toFacesPanelPhoto(photo);
    expect(out.photoId).toBe('p1');
    expect(out.fileName).toBe('a.jpg');
    expect(out.faces.map(f => f.faceId)).toEqual(['r1', 'p1-1']);
  });
});
