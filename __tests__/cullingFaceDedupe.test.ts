import {
  faceBoxesAreSpatiallyRedundant,
  rejectOpenBlurredNonFaces,
  suppressSpatiallyRedundantFaces,
  SpatiallyDedupableFace,
} from '../src/lib/culling/faceSpatialDedupe';

function makeFace(
  overrides: Partial<SpatiallyDedupableFace> & {
    boundingBox: SpatiallyDedupableFace['boundingBox'];
    id: string;
  },
): SpatiallyDedupableFace & {id: string} {
  const {id, ...rest} = overrides;
  return {
    eyeConfidence: 90,
    landmarks: [
      {type: 'eyeLeft'},
      {type: 'eyeRight'},
      {type: 'nose'},
      {type: 'mouth'},
    ],
    id,
    ...rest,
  };
}

describe('faceBoxesAreSpatiallyRedundant', () => {
  it('merges high-IoU duplicates', () => {
    expect(
      faceBoxesAreSpatiallyRedundant(
        {left: 0.2, top: 0.2, width: 0.3, height: 0.35},
        {left: 0.22, top: 0.22, width: 0.28, height: 0.33},
      ),
    ).toBe(true);
  });

  it('merges contained / high-IoS hand boxes', () => {
    expect(
      faceBoxesAreSpatiallyRedundant(
        {left: 0.2, top: 0.15, width: 0.35, height: 0.4},
        {left: 0.28, top: 0.35, width: 0.16, height: 0.16},
      ),
    ).toBe(true);
  });

  it('keeps clearly separated people in a group photo', () => {
    expect(
      faceBoxesAreSpatiallyRedundant(
        {left: 0.05, top: 0.2, width: 0.18, height: 0.22},
        {left: 0.4, top: 0.2, width: 0.18, height: 0.22},
      ),
    ).toBe(false);
  });

  it('keeps similar-sized faces seated close together at a table', () => {
    expect(
      faceBoxesAreSpatiallyRedundant(
        {left: 0.25, top: 0.3, width: 0.18, height: 0.22},
        {left: 0.36, top: 0.28, width: 0.17, height: 0.21},
      ),
    ).toBe(false);
  });

  it('does not IoS-merge similar-sized overlapping faces', () => {
    expect(
      faceBoxesAreSpatiallyRedundant(
        {left: 0.2, top: 0.2, width: 0.22, height: 0.26},
        {left: 0.28, top: 0.24, width: 0.2, height: 0.24},
      ),
    ).toBe(false);
  });
});

describe('suppressSpatiallyRedundantFaces', () => {
  it('keeps the larger real face over a nearby hand-sized box', () => {
    const face = makeFace({
      id: 'person',
      boundingBox: {left: 0.3, top: 0.15, width: 0.28, height: 0.36},
      eyeConfidence: 92,
    });
    const hand = makeFace({
      id: 'hand',
      boundingBox: {left: 0.38, top: 0.38, width: 0.14, height: 0.14},
      eyeConfidence: 88,
      landmarks: [{type: 'eyeLeft'}],
    });

    const kept = suppressSpatiallyRedundantFaces([hand, face]);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.id).toBe('person');
  });

  it('does not drop distant faces', () => {
    const left = makeFace({
      id: 'a',
      boundingBox: {left: 0.05, top: 0.2, width: 0.18, height: 0.22},
    });
    const right = makeFace({
      id: 'b',
      boundingBox: {left: 0.55, top: 0.2, width: 0.18, height: 0.22},
    });

    const kept = suppressSpatiallyRedundantFaces([left, right]);
    expect(kept).toHaveLength(2);
  });
});

describe('rejectOpenBlurredNonFaces', () => {
  it('drops open+blurred hand-like detections', () => {
    const kept = rejectOpenBlurredNonFaces([
      {eyeStatus: 'open', focusLevel: 'blurred'},
      {eyeStatus: 'closed', focusLevel: 'blurred'},
      {eyeStatus: 'open', focusLevel: 'good'},
      {eyeStatus: 'open', focusLevel: 'soft'},
    ]);
    expect(kept).toEqual([
      {eyeStatus: 'closed', focusLevel: 'blurred'},
      {eyeStatus: 'open', focusLevel: 'good'},
      {eyeStatus: 'open', focusLevel: 'soft'},
    ]);
  });
});
