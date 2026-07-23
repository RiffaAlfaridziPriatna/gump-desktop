jest.mock('@lib/culledAlbum/photoStateStore', () => ({
  photoStateStore: {
    getState: () => ({photoOrder: {}}),
  },
}));

import {APIResponse} from '../src/services/api';
import {detectDuplicates} from '../src/lib/culling/duplicateDetection';
import {
  areFaceFramingsSimilar,
  areFileNamesBurstRelated,
  arePhotosNearDuplicates,
  DUPLICATE_TEMPORAL_WINDOW_MS,
  DuplicateDetectionPhoto,
  FACE_FRAMING_MAX_AREA_RATIO,
} from '../src/lib/culling/cullingUtil';

function makeFace(
  overrides: Partial<APIResponse.CullingFace> & {
    boundingBox: APIResponse.CullingFace['boundingBox'];
  },
): APIResponse.CullingFace {
  const box = overrides.boundingBox;
  const eyeLeftX = box.left + box.width * 0.3;
  const eyeRightX = box.left + box.width * 0.7;
  const eyeY = box.top + box.height * 0.35;
  const noseX = box.left + box.width * 0.5;
  const noseY = box.top + box.height * 0.55;
  const mouthX = noseX;
  const mouthY = box.top + box.height * 0.75;

  return {
    eyeStatus: 'open',
    eyeConfidence: 95,
    focusLevel: 'good',
    sharpness: 80,
    brightness: 50,
    landmarks: [
      {type: 'eyeLeft', x: eyeLeftX, y: eyeY},
      {type: 'eyeRight', x: eyeRightX, y: eyeY},
      {type: 'nose', x: noseX, y: noseY},
      {type: 'mouth', x: mouthX, y: mouthY},
    ],
    pose: {pitch: 0, roll: 0, yaw: 0},
    ...overrides,
  };
}

let nextBurstIndex = 1000;

function makePhoto(
  overrides: Partial<DuplicateDetectionPhoto> & {photoId: string},
): DuplicateDetectionPhoto {
  const burstIndex = nextBurstIndex++;
  return {
    fileName: `IMG_${burstIndex}.JPG`,
    faces: [],
    selected: true,
    aiSelected: true,
    maybe: false,
    blurred: false,
    closedEyes: false,
    duplicated: false,
    starRating: 5,
    capturedAt: 1_000_000,
    perceptualHash: null,
    ...overrides,
  };
}

describe('areFileNamesBurstRelated', () => {
  it('accepts same camera stem with nearby counters', () => {
    expect(areFileNamesBurstRelated('IMG_1001.JPG', 'IMG_1003.JPG')).toBe(true);
    expect(areFileNamesBurstRelated('DSC05037.JPG', 'DSC05038.JPG')).toBe(true);
  });

  it('accepts counters within the burst index gap', () => {
    expect(areFileNamesBurstRelated('IMG_1001.JPG', 'IMG_1008.JPG')).toBe(true);
    expect(areFileNamesBurstRelated('IMG_1001.JPG', 'IMG_1011.JPG')).toBe(true);
  });

  it('rejects counters beyond the burst index gap', () => {
    expect(areFileNamesBurstRelated('IMG_1001.JPG', 'IMG_1012.JPG')).toBe(false);
    expect(areFileNamesBurstRelated('IMG_3862.JPG', 'IMG_3881.JPG')).toBe(false);
  });

  it('rejects different camera stems even with nearby numbers', () => {
    expect(areFileNamesBurstRelated('DSC05037.JPG', 'TR5_1337.JPG')).toBe(false);
  });

  it('rejects names without a trailing counter', () => {
    expect(areFileNamesBurstRelated('hero.JPG', 'hero-2.JPG')).toBe(false);
  });
});

describe('areFaceFramingsSimilar', () => {
  it('accepts similarly sized faces', () => {
    expect(
      areFaceFramingsSimilar(
        [makeFace({boundingBox: {left: 0.35, top: 0.2, width: 0.22, height: 0.28}})],
        [makeFace({boundingBox: {left: 0.34, top: 0.21, width: 0.24, height: 0.3}})],
      ),
    ).toBe(true);
  });

  it('rejects close-up vs wide framing of the same subject', () => {
    const closeUp = makeFace({
      boundingBox: {left: 0.3, top: 0.15, width: 0.35, height: 0.45},
    });
    const wide = makeFace({
      boundingBox: {left: 0.4, top: 0.25, width: 0.12, height: 0.16},
    });
    const ratio =
      (closeUp.boundingBox.width * closeUp.boundingBox.height) /
      (wide.boundingBox.width * wide.boundingBox.height);
    expect(ratio).toBeGreaterThan(FACE_FRAMING_MAX_AREA_RATIO);
    expect(areFaceFramingsSimilar([closeUp], [wide])).toBe(false);
  });

  it('rejects portrait vs landscape face boxes even when areas match', () => {
    const portraitOriented = makeFace({
      boundingBox: {left: 0.3, top: 0.38, width: 0.164, height: 0.109},
    });
    const landscapeOriented = makeFace({
      boundingBox: {left: 0.34, top: 0.25, width: 0.107, height: 0.161},
    });
    expect(areFaceFramingsSimilar([portraitOriented], [landscapeOriented])).toBe(
      false,
    );
  });
});

describe('arePhotosNearDuplicates', () => {
  it('matches on similar perceptual hash alone when filenames are burst-related', () => {
    expect(
      arePhotosNearDuplicates(
        makePhoto({
          photoId: 'a',
          fileName: 'IMG_1001.JPG',
          perceptualHash: 'aaaaaaaaaaaaaaaa',
          faces: [],
        }),
        makePhoto({
          photoId: 'b',
          fileName: 'IMG_1002.JPG',
          perceptualHash: 'aaaaaaaaaaaaaaa8',
          faces: [],
        }),
      ),
    ).toBe(true);
  });

  it('does not match similar hashes from different camera stems', () => {
    expect(
      arePhotosNearDuplicates(
        makePhoto({
          photoId: 'a',
          fileName: 'DSC05037.JPG',
          perceptualHash: 'aaaaaaaaaaaaaaaa',
          faces: [],
        }),
        makePhoto({
          photoId: 'b',
          fileName: 'TR5_1337.JPG',
          perceptualHash: 'aaaaaaaaaaaaaaa8',
          faces: [],
        }),
      ),
    ).toBe(false);
  });

  it('does not match similar faces with different framing', () => {
    const closeUp = makeFace({
      boundingBox: {left: 0.3, top: 0.15, width: 0.35, height: 0.45},
    });
    const wide = makeFace({
      boundingBox: {left: 0.4, top: 0.25, width: 0.12, height: 0.16},
    });
    expect(
      arePhotosNearDuplicates(
        makePhoto({
          photoId: 'close',
          fileName: 'IMG_2001.JPG',
          perceptualHash: '1111111111111111',
          faces: [closeUp],
        }),
        makePhoto({
          photoId: 'wide',
          fileName: 'IMG_2002.JPG',
          perceptualHash: 'ffffffffffffffff',
          faces: [wide],
        }),
      ),
    ).toBe(false);
  });

  it('matches similar faces with similar framing when hashes differ but stay same-scene', () => {
    const faceA = makeFace({
      boundingBox: {left: 0.35, top: 0.2, width: 0.22, height: 0.28},
    });
    const faceB = makeFace({
      boundingBox: {left: 0.36, top: 0.21, width: 0.23, height: 0.29},
    });
    expect(
      arePhotosNearDuplicates(
        makePhoto({
          photoId: 'a',
          fileName: 'IMG_3001.JPG',
          perceptualHash: '0000000000000000',
          faces: [faceA],
        }),
        makePhoto({
          photoId: 'b',
          fileName: 'IMG_3002.JPG',
          perceptualHash: '00000000000000ff',
          faces: [faceB],
        }),
      ),
    ).toBe(true);
  });

  it('matches similar faces when pHash is burst-like (~21) but above strict threshold', () => {
    const faceA = makeFace({
      boundingBox: {left: 0.35, top: 0.2, width: 0.22, height: 0.28},
    });
    const faceB = makeFace({
      boundingBox: {left: 0.36, top: 0.21, width: 0.23, height: 0.29},
    });
    expect(
      arePhotosNearDuplicates(
        makePhoto({
          photoId: 'a',
          fileName: 'IMG_3909.JPG',
          perceptualHash: '0000000000000000',
          faces: [faceA],
        }),
        makePhoto({
          photoId: 'b',
          fileName: 'IMG_3910.JPG',
          perceptualHash: '0000000000ffffff',
          faces: [faceB],
        }),
      ),
    ).toBe(true);
  });

  it('does not match similar faces when perceptual hashes indicate different scenes', () => {
    const faceA = makeFace({
      boundingBox: {left: 0.35, top: 0.2, width: 0.22, height: 0.28},
    });
    const faceB = makeFace({
      boundingBox: {left: 0.36, top: 0.21, width: 0.23, height: 0.29},
    });
    expect(
      arePhotosNearDuplicates(
        makePhoto({
          photoId: 'a',
          fileName: 'IMG_3790.JPG',
          perceptualHash: '1111111111111111',
          faces: [faceA],
        }),
        makePhoto({
          photoId: 'b',
          fileName: 'IMG_3811.JPG',
          perceptualHash: 'ffffffffffffffff',
          faces: [faceB],
        }),
      ),
    ).toBe(false);
  });

  it('does not match across a large filename gap even with similar faces and same-scene hashes', () => {
    const faceA = makeFace({
      boundingBox: {left: 0.42, top: 0.32, width: 0.078, height: 0.118},
    });
    const faceB = makeFace({
      boundingBox: {left: 0.427, top: 0.309, width: 0.101, height: 0.151},
    });
    expect(
      arePhotosNearDuplicates(
        makePhoto({
          photoId: 'wide',
          fileName: 'IMG_3862.JPG',
          perceptualHash: '0000000000000000',
          faces: [faceA],
        }),
        makePhoto({
          photoId: 'medium',
          fileName: 'IMG_3881.JPG',
          perceptualHash: '00000000000000ff',
          faces: [faceB],
        }),
      ),
    ).toBe(false);
  });

  it('matches adjacent burst frames with similar framing even when pHash is above same-scene gate', () => {
    const faceA = makeFace({
      boundingBox: {left: 0.424, top: 0.305, width: 0.163, height: 0.108},
    });
    const faceB = makeFace({
      boundingBox: {left: 0.422, top: 0.308, width: 0.165, height: 0.11},
    });
    // Hamming 26 — above same-scene 24, within adjacent-scene 30 (DSC04696/DSC04697).
    expect(
      arePhotosNearDuplicates(
        makePhoto({
          photoId: 'a',
          fileName: 'DSC04696.JPG',
          perceptualHash: '0000000000000000',
          faces: [faceA],
        }),
        makePhoto({
          photoId: 'b',
          fileName: 'DSC04697.JPG',
          perceptualHash: '03ffffff00000000',
          faces: [faceB],
        }),
      ),
    ).toBe(true);
  });

  it('matches adjacent burst frames on framing when face landmarks shifted', () => {
    const faceA = makeFace({
      boundingBox: {left: 0.594, top: 0.411, width: 0.12, height: 0.08},
    });
    const faceB = makeFace({
      boundingBox: {left: 0.618, top: 0.411, width: 0.114, height: 0.076},
      pose: {pitch: 12, roll: 0, yaw: -18},
    });
    // Hamming 8 — face fingerprints may diverge with pose; framing still matches (DSC04705/706).
    expect(
      arePhotosNearDuplicates(
        makePhoto({
          photoId: 'a',
          fileName: 'DSC04705.JPG',
          perceptualHash: '0000000000000000',
          faces: [faceA],
        }),
        makePhoto({
          photoId: 'b',
          fileName: 'DSC04706.JPG',
          perceptualHash: '00000000000000ff',
          faces: [faceB],
        }),
      ),
    ).toBe(true);
  });
});

describe('detectDuplicates', () => {
  it('flags the lower-rated burst photo within the temporal window', () => {
    const t0 = 1_700_000_000_000;
    const photos: Record<string, DuplicateDetectionPhoto> = {
      keep: makePhoto({
        photoId: 'keep',
        fileName: 'IMG_4001.JPG',
        capturedAt: t0,
        starRating: 5,
        perceptualHash: 'aaaaaaaaaaaaaaaa',
      }),
      dup: makePhoto({
        photoId: 'dup',
        fileName: 'IMG_4002.JPG',
        capturedAt: t0 + 2_000,
        starRating: 4,
        perceptualHash: 'aaaaaaaaaaaaaaa8',
      }),
    };

    detectDuplicates(photos);

    expect(photos.keep!.duplicated).toBe(false);
    expect(photos.dup!.duplicated).toBe(true);
  });

  it('does not group similar hashes outside the 5-minute window', () => {
    const t0 = 1_700_000_000_000;
    const photos: Record<string, DuplicateDetectionPhoto> = {
      first: makePhoto({
        photoId: 'first',
        fileName: 'IMG_5001.JPG',
        capturedAt: t0,
        starRating: 5,
        perceptualHash: 'aaaaaaaaaaaaaaaa',
      }),
      later: makePhoto({
        photoId: 'later',
        fileName: 'IMG_5002.JPG',
        capturedAt: t0 + DUPLICATE_TEMPORAL_WINDOW_MS + 1,
        starRating: 4,
        perceptualHash: 'aaaaaaaaaaaaaaa8',
      }),
    };

    detectDuplicates(photos);

    expect(photos.first!.duplicated).toBe(false);
    expect(photos.later!.duplicated).toBe(false);
  });

  it('does not flag close-up vs wide of the same face inside the window', () => {
    const t0 = 1_700_000_000_000;
    const closeUp = makeFace({
      boundingBox: {left: 0.3, top: 0.15, width: 0.35, height: 0.45},
    });
    const wide = makeFace({
      boundingBox: {left: 0.4, top: 0.25, width: 0.12, height: 0.16},
    });
    const photos: Record<string, DuplicateDetectionPhoto> = {
      close: makePhoto({
        photoId: 'close',
        fileName: 'IMG_6001.JPG',
        capturedAt: t0,
        starRating: 4,
        perceptualHash: '1111111111111111',
        faces: [closeUp],
      }),
      wide: makePhoto({
        photoId: 'wide',
        fileName: 'IMG_6002.JPG',
        capturedAt: t0 + 30_000,
        starRating: 5,
        perceptualHash: 'ffffffffffffffff',
        faces: [wide],
      }),
    };

    detectDuplicates(photos);

    expect(photos.close!.duplicated).toBe(false);
    expect(photos.wide!.duplicated).toBe(false);
  });

  it('does not group DSC vs TR5 even when faces and timing match', () => {
    const t0 = 1_700_000_000_000;
    const face = makeFace({
      boundingBox: {left: 0.35, top: 0.2, width: 0.22, height: 0.28},
    });
    const photos: Record<string, DuplicateDetectionPhoto> = {
      dsc: makePhoto({
        photoId: 'dsc',
        fileName: 'DSC05037.JPG',
        capturedAt: t0,
        starRating: 5,
        perceptualHash: 'aaaaaaaaaaaaaaaa',
        faces: [face],
      }),
      tr5: makePhoto({
        photoId: 'tr5',
        fileName: 'TR5_1337.JPG',
        capturedAt: t0 + 14_000,
        starRating: 4,
        perceptualHash: 'aaaaaaaaaaaaaaa8',
        faces: [face],
      }),
    };

    detectDuplicates(photos);

    expect(photos.dsc!.duplicated).toBe(false);
    expect(photos.tr5!.duplicated).toBe(false);
  });

  it('on equal quality keeps the earlier burst frame, not Set insertion order', () => {
    const t0 = 1_700_000_000_000;
    const photos: Record<string, DuplicateDetectionPhoto> = {
      second: makePhoto({
        photoId: 'second',
        fileName: 'IMG_3690.JPG',
        capturedAt: t0 + 1_000,
        starRating: 5,
        perceptualHash: 'aaaaaaaaaaaaaaaa',
      }),
      first: makePhoto({
        photoId: 'first',
        fileName: 'IMG_3689.JPG',
        capturedAt: t0,
        starRating: 5,
        perceptualHash: 'aaaaaaaaaaaaaaa8',
      }),
      third: makePhoto({
        photoId: 'third',
        fileName: 'IMG_3691.JPG',
        capturedAt: t0 + 2_000,
        starRating: 5,
        perceptualHash: 'aaaaaaaaaaaaaaa0',
      }),
    };

    detectDuplicates(photos);

    expect(photos.first!.duplicated).toBe(false);
    expect(photos.second!.duplicated).toBe(true);
    expect(photos.third!.duplicated).toBe(true);
  });

  it('on equal quality and equal time prefers the earlier file name', () => {
    const t0 = 1_700_000_000_000;
    const photos: Record<string, DuplicateDetectionPhoto> = {
      b: makePhoto({
        photoId: 'b',
        fileName: 'IMG_3690.JPG',
        capturedAt: t0,
        starRating: 5,
        perceptualHash: 'aaaaaaaaaaaaaaaa',
      }),
      a: makePhoto({
        photoId: 'a',
        fileName: 'IMG_3689.JPG',
        capturedAt: t0,
        starRating: 5,
        perceptualHash: 'aaaaaaaaaaaaaaa8',
      }),
    };

    detectDuplicates(photos);

    expect(photos.a!.duplicated).toBe(false);
    expect(photos.b!.duplicated).toBe(true);
  });
});
