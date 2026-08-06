jest.mock('@lib/culledAlbum/photoStateStore', () => ({
  photoStateStore: {
    getState: () => ({photoOrder: {}}),
  },
}));

import {
  computeKeyFaces,
  type CullingFace,
  type CullingPhoto,
} from '../src/lib/culling/cullingUtil';

function landmarksAround(
  box: CullingFace['boundingBox'],
  jitter = 0,
): CullingFace['landmarks'] {
  const midX = box.left + box.width * 0.5 + jitter;
  const midY = box.top + box.height * 0.35 + jitter;
  const eyeSpan = box.width * 0.28;
  return [
    {type: 'eyeLeft', x: midX - eyeSpan / 2, y: midY},
    {type: 'eyeRight', x: midX + eyeSpan / 2, y: midY},
    {type: 'nose', x: midX, y: midY + box.height * 0.18},
    {type: 'mouth', x: midX, y: midY + box.height * 0.32},
  ];
}

function makeFace(overrides: Partial<CullingFace> = {}): CullingFace {
  const boundingBox = overrides.boundingBox ?? {
    left: 0.3,
    top: 0.2,
    width: 0.25,
    height: 0.3,
  };
  return {
    boundingBox,
    eyeStatus: 'open',
    eyeConfidence: 90,
    focusLevel: 'good',
    sharpness: 70,
    brightness: 50,
    landmarks: landmarksAround(boundingBox),
    pose: {pitch: 0, roll: 0, yaw: 0},
    ...overrides,
  };
}

function makePhoto(
  photoId: string,
  faces: CullingFace[],
  fileName = `${photoId}.jpg`,
): CullingPhoto {
  return {
    photoId,
    fileName,
    faces,
    selected: false,
    aiSelected: false,
    maybe: false,
    blurred: false,
    closedEyes: false,
    duplicated: false,
    starRating: null,
  };
}

describe('computeKeyFaces', () => {
  it('merges under-clustered identical faces with the same eye and focus', () => {
    const box = {left: 0.32, top: 0.22, width: 0.24, height: 0.28};
    const faceA = makeFace({
      boundingBox: box,
      rekognitionFaceId: 'person-1',
      cropUri: 'crop://a',
      sharpness: 55,
    });
    const faceB = makeFace({
      boundingBox: {
        left: box.left + 0.005,
        top: box.top + 0.004,
        width: box.width - 0.01,
        height: box.height - 0.008,
      },
      landmarks: landmarksAround(box, 0.001),
      rekognitionFaceId: 'person-99',
      cropUri: 'crop://b',
      sharpness: 95,
    });

    const keyFaces = computeKeyFaces([
      makePhoto('photo-a', [faceA]),
      makePhoto('photo-b', [faceB]),
    ]);

    expect(keyFaces).toHaveLength(1);
    expect(keyFaces[0]?.eyeStatus).toBe('open');
    expect(keyFaces[0]?.focusLevel).toBe('good');
    expect(keyFaces[0]?.occurrenceCount).toBe(2);
    expect(keyFaces[0]?.photoIds).toEqual(['photo-a', 'photo-b']);
    expect(keyFaces[0]?.cropUri).toBe('crop://b');
  });

  it('keeps separate entries when eye status differs for the same person', () => {
    const box = {left: 0.3, top: 0.2, width: 0.25, height: 0.3};
    const open = makeFace({
      boundingBox: box,
      eyeStatus: 'open',
      rekognitionFaceId: 'person-1',
    });
    const closed = makeFace({
      boundingBox: box,
      landmarks: landmarksAround(box, 0.001),
      eyeStatus: 'closed',
      rekognitionFaceId: 'person-1',
    });

    const keyFaces = computeKeyFaces([
      makePhoto('photo-a', [open]),
      makePhoto('photo-b', [closed]),
    ]);

    expect(keyFaces).toHaveLength(2);
    expect(keyFaces.map(face => face.eyeStatus).sort()).toEqual([
      'closed',
      'open',
    ]);
  });

  it('does not merge clearly different people with the same eye and focus', () => {
    const leftBox = {left: 0.05, top: 0.2, width: 0.18, height: 0.22};
    const rightBox = {left: 0.7, top: 0.25, width: 0.2, height: 0.24};
    const leftMidX = leftBox.left + leftBox.width * 0.5;
    const leftMidY = leftBox.top + leftBox.height * 0.35;
    const rightMidX = rightBox.left + rightBox.width * 0.5;
    const rightMidY = rightBox.top + rightBox.height * 0.35;

    const left = makeFace({
      boundingBox: leftBox,
      landmarks: [
        {type: 'eyeLeft', x: leftMidX - 0.03, y: leftMidY},
        {type: 'eyeRight', x: leftMidX + 0.03, y: leftMidY},
        {type: 'nose', x: leftMidX, y: leftMidY + 0.04},
        {type: 'mouth', x: leftMidX, y: leftMidY + 0.07},
      ],
      rekognitionFaceId: 'person-left',
    });
    const right = makeFace({
      boundingBox: rightBox,
      landmarks: [
        {type: 'eyeLeft', x: rightMidX - 0.07, y: rightMidY - 0.01},
        {type: 'eyeRight', x: rightMidX + 0.07, y: rightMidY + 0.015},
        {type: 'nose', x: rightMidX + 0.025, y: rightMidY + 0.09},
        {type: 'mouth', x: rightMidX - 0.02, y: rightMidY + 0.14},
      ],
      pose: {pitch: 12, roll: 0, yaw: -35},
      rekognitionFaceId: 'person-right',
    });

    const keyFaces = computeKeyFaces([
      makePhoto('photo-a', [left]),
      makePhoto('photo-b', [right]),
    ]);

    expect(keyFaces).toHaveLength(2);
  });

  it('updates the representative crop when a better same-variant face appears', () => {
    const box = {left: 0.3, top: 0.2, width: 0.25, height: 0.3};
    const weak = makeFace({
      boundingBox: box,
      rekognitionFaceId: 'person-1',
      cropUri: 'crop://weak',
      sharpness: 40,
      pose: {pitch: 20, roll: 0, yaw: 30},
    });
    const strong = makeFace({
      boundingBox: {left: 0.28, top: 0.18, width: 0.3, height: 0.34},
      rekognitionFaceId: 'person-1',
      cropUri: 'crop://strong',
      sharpness: 95,
      pose: {pitch: 0, roll: 0, yaw: 0},
    });

    const keyFaces = computeKeyFaces([
      makePhoto('photo-a', [weak]),
      makePhoto('photo-b', [strong]),
    ]);

    expect(keyFaces).toHaveLength(1);
    expect(keyFaces[0]?.cropUri).toBe('crop://strong');
    expect(keyFaces[0]?.sourcePhotoId).toBe('photo-b');
    expect(keyFaces[0]?.occurrenceCount).toBe(2);
  });

  it('merges same person across mild pose change via soft-weighted identity fingerprint', () => {
    const box = {left: 0.3, top: 0.2, width: 0.25, height: 0.3};
    const frontal = makeFace({
      boundingBox: box,
      rekognitionFaceId: 'person-a',
      cropUri: 'crop://frontal',
      pose: {pitch: 0, roll: 0, yaw: 0},
      sharpness: 70,
    });
    const turned = makeFace({
      boundingBox: {
        left: box.left + 0.01,
        top: box.top,
        width: box.width,
        height: box.height,
      },
      landmarks: landmarksAround(box, 0.002),
      rekognitionFaceId: 'person-b',
      cropUri: 'crop://turned',
      pose: {pitch: 4, roll: 0, yaw: 18},
      sharpness: 75,
    });

    const keyFaces = computeKeyFaces([
      makePhoto('photo-a', [frontal]),
      makePhoto('photo-b', [turned]),
    ]);

    expect(keyFaces).toHaveLength(1);
    expect(keyFaces[0]?.occurrenceCount).toBe(2);
  });

  it('keeps every face from a group photo instead of collapsing them', () => {
    const faces: CullingFace[] = [];
    for (let index = 0; index < 12; index++) {
      const col = index % 4;
      const row = Math.floor(index / 4);
      const box = {
        left: 0.08 + col * 0.22,
        top: 0.18 + row * 0.22,
        width: 0.14,
        height: 0.16,
      };
      faces.push(
        makeFace({
          boundingBox: box,
          landmarks: landmarksAround(box),
          rekognitionFaceId: `person-${index}`,
          cropUri: `crop://group-${index}`,
          eyeStatus: 'open',
          focusLevel: 'good',
        }),
      );
    }

    const keyFaces = computeKeyFaces([makePhoto('group-photo', faces)]);
    expect(keyFaces).toHaveLength(12);
  });

  it('does not force-merge different people just because photos share a duplicate group', () => {
    const leftBox = {left: 0.1, top: 0.2, width: 0.2, height: 0.25};
    const rightBox = {left: 0.55, top: 0.3, width: 0.22, height: 0.28};
    const leftMidX = leftBox.left + leftBox.width * 0.5;
    const leftMidY = leftBox.top + leftBox.height * 0.35;
    const rightMidX = rightBox.left + rightBox.width * 0.5;
    const rightMidY = rightBox.top + rightBox.height * 0.35;

    const faceA = makeFace({
      boundingBox: leftBox,
      landmarks: [
        {type: 'eyeLeft', x: leftMidX - 0.025, y: leftMidY},
        {type: 'eyeRight', x: leftMidX + 0.025, y: leftMidY},
        {type: 'nose', x: leftMidX, y: leftMidY + 0.035},
        {type: 'mouth', x: leftMidX, y: leftMidY + 0.065},
      ],
      rekognitionFaceId: 'person-a',
      cropUri: 'crop://a',
    });
    const faceB = makeFace({
      boundingBox: rightBox,
      landmarks: [
        {type: 'eyeLeft', x: rightMidX - 0.08, y: rightMidY - 0.02},
        {type: 'eyeRight', x: rightMidX + 0.08, y: rightMidY + 0.02},
        {type: 'nose', x: rightMidX + 0.03, y: rightMidY + 0.1},
        {type: 'mouth', x: rightMidX - 0.03, y: rightMidY + 0.16},
      ],
      rekognitionFaceId: 'person-b',
      cropUri: 'crop://b',
    });

    const keyFaces = computeKeyFaces(
      [makePhoto('photo-a', [faceA]), makePhoto('photo-b', [faceB])],
      {duplicatePhotoGroups: [{photoIds: ['photo-a', 'photo-b']}]},
    );

    expect(keyFaces).toHaveLength(2);
  });

  it('merges burst twins in a duplicate group when framing stays in the same slot', () => {
    const box = {left: 0.3, top: 0.2, width: 0.25, height: 0.3};
    const faceA = makeFace({
      boundingBox: box,
      landmarks: landmarksAround(box),
      rekognitionFaceId: 'person-a',
      cropUri: 'crop://a',
      sharpness: 60,
      pose: {pitch: 0, roll: 0, yaw: 0},
    });
    const faceB = makeFace({
      boundingBox: {
        left: box.left + 0.012,
        top: box.top + 0.01,
        width: box.width * 0.96,
        height: box.height * 0.97,
      },
      landmarks: landmarksAround(box, 0.012),
      rekognitionFaceId: 'person-b',
      cropUri: 'crop://b',
      sharpness: 88,
      pose: {pitch: 6, roll: 0, yaw: 22},
    });

    const withoutGroups = computeKeyFaces([
      makePhoto('photo-a', [faceA]),
      makePhoto('photo-b', [faceB]),
    ]);

    const withGroups = computeKeyFaces(
      [makePhoto('photo-a', [faceA]), makePhoto('photo-b', [faceB])],
      {duplicatePhotoGroups: [{photoIds: ['photo-a', 'photo-b']}]},
    );

    expect(withGroups).toHaveLength(1);
    expect(withGroups[0]?.photoIds).toEqual(['photo-a', 'photo-b']);
    expect(withoutGroups.length).toBeGreaterThanOrEqual(1);
  });

  it('does not force-merge different eye status even in the same duplicate group', () => {
    const box = {left: 0.3, top: 0.2, width: 0.25, height: 0.3};
    const open = makeFace({
      boundingBox: box,
      eyeStatus: 'open',
      rekognitionFaceId: 'person-a',
    });
    const closed = makeFace({
      boundingBox: box,
      landmarks: landmarksAround(box, 0.001),
      eyeStatus: 'closed',
      rekognitionFaceId: 'person-b',
    });

    const keyFaces = computeKeyFaces(
      [makePhoto('photo-a', [open]), makePhoto('photo-b', [closed])],
      {duplicatePhotoGroups: [{photoIds: ['photo-a', 'photo-b']}]},
    );

    expect(keyFaces).toHaveLength(2);
  });
});
