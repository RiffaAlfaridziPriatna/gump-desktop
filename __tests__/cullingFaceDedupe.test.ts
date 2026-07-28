import {
  faceBoxesAreSpatiallyRedundant,
  rejectLikelyDisplayedMediaFaces,
  rejectLikelyNonFaceArtifacts,
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

describe('rejectLikelyNonFaceArtifacts', () => {
  it('drops tiny detections like tripod joints and distant hands', () => {
    const kept = rejectLikelyNonFaceArtifacts([
      {
        eyeStatus: 'open',
        focusLevel: 'good',
        boundingBox: {left: 0.3, top: 0.2, width: 0.08, height: 0.12},
      },
      {
        eyeStatus: 'closed',
        focusLevel: 'good',
        boundingBox: {left: 0.6, top: 0.73, width: 0.014, height: 0.021},
      },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.boundingBox.width).toBeCloseTo(0.08);
  });

  it('drops a tiny hand when larger real faces exist in the same photo', () => {
    const kept = rejectLikelyNonFaceArtifacts([
      {
        eyeStatus: 'open',
        focusLevel: 'good',
        boundingBox: {left: 0.44, top: 0.35, width: 0.029, height: 0.044},
      },
      {
        eyeStatus: 'open',
        focusLevel: 'good',
        boundingBox: {left: 0.64, top: 0.35, width: 0.029, height: 0.043},
      },
      {
        eyeStatus: 'open',
        focusLevel: 'good',
        boundingBox: {left: 0.86, top: 0.5, width: 0.018, height: 0.027},
      },
    ]);
    expect(kept).toHaveLength(2);
    expect(kept.every(face => face.boundingBox.width >= 0.029)).toBe(true);
  });

  it('keeps similarly small faces in a wide group photo', () => {
    const kept = rejectLikelyNonFaceArtifacts([
      {
        eyeStatus: 'open',
        focusLevel: 'good',
        boundingBox: {left: 0.1, top: 0.5, width: 0.022, height: 0.033},
      },
      {
        eyeStatus: 'open',
        focusLevel: 'good',
        boundingBox: {left: 0.2, top: 0.5, width: 0.021, height: 0.032},
      },
      {
        eyeStatus: 'open',
        focusLevel: 'good',
        boundingBox: {left: 0.3, top: 0.5, width: 0.02, height: 0.03},
      },
    ]);
    expect(kept).toHaveLength(3);
  });

  it('drops soft mid-size elbow/hand-like detections but keeps soft large faces', () => {
    const kept = rejectLikelyNonFaceArtifacts([
      {
        eyeStatus: 'open',
        focusLevel: 'soft',
        boundingBox: {left: 0.7, top: 0.77, width: 0.075, height: 0.112},
      },
      {
        eyeStatus: 'open',
        focusLevel: 'soft',
        boundingBox: {left: 0.25, top: 0.18, width: 0.28, height: 0.36},
      },
      {
        eyeStatus: 'open',
        focusLevel: 'good',
        boundingBox: {left: 0.4, top: 0.3, width: 0.06, height: 0.09},
      },
    ]);
    expect(kept).toHaveLength(2);
    expect(kept.map(face => face.boundingBox.width)).toEqual([0.28, 0.06]);
  });

  it('keeps a lone soft speaker-sized face (regression: IMG_3982)', () => {
    const kept = rejectLikelyNonFaceArtifacts([
      {
        eyeStatus: 'open',
        focusLevel: 'soft',
        boundingBox: {left: 0.411, top: 0.329, width: 0.08, height: 0.12},
      },
    ]);
    expect(kept).toHaveLength(1);
  });
  it('keeps peer-sized soft faces such as a blink in a two-person portrait', () => {
    const kept = rejectLikelyNonFaceArtifacts([
      {
        eyeStatus: 'open',
        focusLevel: 'good',
        boundingBox: {left: 0.34, top: 0.35, width: 0.081, height: 0.121},
      },
      {
        eyeStatus: 'closed',
        focusLevel: 'soft',
        boundingBox: {left: 0.47, top: 0.34, width: 0.079, height: 0.118},
      },
    ]);
    expect(kept).toHaveLength(2);
  });

  it('defers extreme tiny-below-poster cases to the media filter', () => {
    const kept = rejectLikelyNonFaceArtifacts([
      {
        eyeStatus: 'open',
        focusLevel: 'good',
        boundingBox: {left: 0.32, top: 0.36, width: 0.062, height: 0.093},
      },
      {
        eyeStatus: 'open',
        focusLevel: 'good',
        boundingBox: {left: 0.46, top: 0.47, width: 0.018, height: 0.024},
      },
    ]);
    expect(kept).toHaveLength(2);
  });
});

describe('rejectLikelyDisplayedMediaFaces', () => {
  it('drops a similar-sized side LED poster next to a more centered person', () => {
    const person = {
      id: 'person',
      boundingBox: {left: 0.478, top: 0.385, width: 0.075, height: 0.113},
      pose: {yaw: 0, pitch: 0, roll: 0},
    };
    const poster = {
      id: 'poster',
      boundingBox: {left: 0.69, top: 0.33, width: 0.066, height: 0.099},
      pose: {yaw: 0, pitch: 0, roll: 0},
    };
    const kept = rejectLikelyDisplayedMediaFaces([person, poster]);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.id).toBe('person');
  });

  it('drops a mid-size slide portrait above a smaller real speaker', () => {
    const slide = {
      id: 'slide',
      boundingBox: {left: 0.32, top: 0.36, width: 0.062, height: 0.093},
      pose: {yaw: 0, pitch: 0, roll: 0},
    };
    const speaker = {
      id: 'speaker',
      boundingBox: {left: 0.46, top: 0.47, width: 0.018, height: 0.024},
      pose: {yaw: 0.1, pitch: 0, roll: 0},
    };
    const kept = rejectLikelyDisplayedMediaFaces([slide, speaker]);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.id).toBe('speaker');
  });

  it('drops oversized upper LED/poster faces when a real person is lower', () => {
    const poster = {
      id: 'poster',
      boundingBox: {left: 0.55, top: 0.08, width: 0.32, height: 0.42},
      pose: {yaw: 0.9, pitch: 0, roll: 0},
    };
    const presenter = {
      id: 'presenter',
      boundingBox: {left: 0.28, top: 0.48, width: 0.12, height: 0.16},
      pose: {yaw: 0.1, pitch: 0, roll: 0},
    };

    const kept = rejectLikelyDisplayedMediaFaces([poster, presenter]);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.id).toBe('presenter');
  });

  it('drops billboard faces even when Vision boxes the jaw (lower face top)', () => {
    const poster = {
      id: 'poster',
      boundingBox: {left: 0.52, top: 0.22, width: 0.28, height: 0.34},
      pose: {yaw: 0.8, pitch: 0, roll: 0},
    };
    const presenter = {
      id: 'presenter',
      boundingBox: {left: 0.3, top: 0.5, width: 0.14, height: 0.18},
      pose: {yaw: 0.05, pitch: 0, roll: 0},
    };

    const kept = rejectLikelyDisplayedMediaFaces([poster, presenter]);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.id).toBe('presenter');
  });

  it('drops mid-frame jaw-boxed billboard faces above a smaller presenter', () => {
    const poster = {
      id: 'poster',
      boundingBox: {left: 0.5, top: 0.28, width: 0.3, height: 0.32},
      pose: {yaw: 0, pitch: 0, roll: 0},
    };
    const presenter = {
      id: 'presenter',
      boundingBox: {left: 0.3, top: 0.46, width: 0.14, height: 0.18},
      pose: {yaw: 0, pitch: 0, roll: 0},
    };

    const kept = rejectLikelyDisplayedMediaFaces([poster, presenter]);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.id).toBe('presenter');
  });

  it('drops IMG_3835 Vision boxes (under-boxed poster above tiny presenter)', () => {
    const poster = {
      id: 'poster',
      boundingBox: {left: 0.503, top: 0.179, width: 0.118, height: 0.177},
      pose: {yaw: 0, pitch: 0, roll: 0},
    };
    const presenter = {
      id: 'presenter',
      boundingBox: {left: 0.415, top: 0.498, width: 0.028, height: 0.043},
      pose: {yaw: 0, pitch: 0, roll: 0},
    };

    const kept = rejectLikelyDisplayedMediaFaces([poster, presenter]);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.id).toBe('presenter');
  });

  it('drops side profile poster faces even when size is close to the presenter', () => {
    const poster = {
      id: 'poster',
      boundingBox: {left: 0.58, top: 0.2, width: 0.18, height: 0.22},
      pose: {yaw: 0.85, pitch: 0, roll: 0},
    };
    const presenter = {
      id: 'presenter',
      boundingBox: {left: 0.32, top: 0.42, width: 0.16, height: 0.2},
      pose: {yaw: 0.08, pitch: 0, roll: 0},
    };

    const kept = rejectLikelyDisplayedMediaFaces([poster, presenter]);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.id).toBe('presenter');
  });

  it('drops giant side billboard faces even with yaw 0 and similar vertical centers', () => {
    const poster = {
      id: 'poster',
      boundingBox: {left: 0.55, top: 0.2, width: 0.35, height: 0.4},
      pose: {yaw: 0, pitch: 0, roll: 0},
    };
    const presenter = {
      id: 'presenter',
      boundingBox: {left: 0.3, top: 0.38, width: 0.12, height: 0.15},
      pose: {yaw: 0, pitch: 0, roll: 0},
    };

    const kept = rejectLikelyDisplayedMediaFaces([poster, presenter]);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.id).toBe('presenter');
  });

  it('keeps similar-sized people in a normal group photo', () => {
    const left = {
      id: 'a',
      boundingBox: {left: 0.1, top: 0.25, width: 0.16, height: 0.2},
      pose: {yaw: 0.1, pitch: 0, roll: 0},
    };
    const right = {
      id: 'b',
      boundingBox: {left: 0.55, top: 0.22, width: 0.17, height: 0.21},
      pose: {yaw: 0.12, pitch: 0, roll: 0},
    };

    const kept = rejectLikelyDisplayedMediaFaces([left, right]);
    expect(kept).toHaveLength(2);
  });

  it('keeps a dense group photo when SCRFD yaw is in radians (Vision units)', () => {
    // TR5_1353-style: many similar faces, side columns with mild pose.
    // SCRFD must emit radians; degree yaw (~1–3) was misread as radians and
    // wiped the left/right columns via the profile-on-side gate.
    const faces = [
      {id: 'l0', boundingBox: {left: 0.14, top: 0.53, width: 0.02, height: 0.035}, pose: {yaw: 0.03}},
      {id: 'l1', boundingBox: {left: 0.21, top: 0.52, width: 0.019, height: 0.034}, pose: {yaw: -0.04}},
      {id: 'l2', boundingBox: {left: 0.28, top: 0.50, width: 0.017, height: 0.033}, pose: {yaw: 0.05}},
      {id: 'c0', boundingBox: {left: 0.45, top: 0.51, width: 0.016, height: 0.03}, pose: {yaw: 0.01}},
      {id: 'c1', boundingBox: {left: 0.52, top: 0.50, width: 0.017, height: 0.034}, pose: {yaw: -0.02}},
      {id: 'r0', boundingBox: {left: 0.68, top: 0.50, width: 0.017, height: 0.032}, pose: {yaw: 0.04}},
      {id: 'r1', boundingBox: {left: 0.78, top: 0.55, width: 0.018, height: 0.033}, pose: {yaw: -0.05}},
      {id: 'r2', boundingBox: {left: 0.88, top: 0.54, width: 0.018, height: 0.034}, pose: {yaw: 0.02}},
    ];

    const kept = rejectLikelyDisplayedMediaFaces(faces);
    expect(kept).toHaveLength(faces.length);
  });

  it('still drops a true side profile (radians) next to frontal people', () => {
    const profile = {
      id: 'profile',
      boundingBox: {left: 0.05, top: 0.5, width: 0.02, height: 0.035},
      pose: {yaw: 0.85},
    };
    const frontal = {
      id: 'frontal',
      boundingBox: {left: 0.45, top: 0.5, width: 0.02, height: 0.035},
      pose: {yaw: 0.05},
    };
    const kept = rejectLikelyDisplayedMediaFaces([profile, frontal]);
    expect(kept.map(face => face.id)).toEqual(['frontal']);
  });
});
