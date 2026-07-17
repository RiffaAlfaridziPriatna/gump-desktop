jest.mock('@lib/culledAlbum/photoStateStore', () => ({
  photoStateStore: {
    getState: () => ({photoOrder: {}}),
  },
}));

import {APIResponse} from '../src/services/api';
import {detectDuplicates} from '../src/lib/culling/duplicateDetection';
import {
  areFaceFramingsSimilar,
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

function makePhoto(
  overrides: Partial<DuplicateDetectionPhoto> & {photoId: string},
): DuplicateDetectionPhoto {
  return {
    fileName: `${overrides.photoId}.JPG`,
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
});

describe('arePhotosNearDuplicates', () => {
  it('matches on similar perceptual hash alone', () => {
    expect(
      arePhotosNearDuplicates(
        makePhoto({photoId: 'a', perceptualHash: 'aaaaaaaaaaaaaaaa', faces: []}),
        makePhoto({photoId: 'b', perceptualHash: 'aaaaaaaaaaaaaaa8', faces: []}),
      ),
    ).toBe(true);
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
          perceptualHash: '1111111111111111',
          faces: [closeUp],
        }),
        makePhoto({
          photoId: 'wide',
          perceptualHash: 'ffffffffffffffff',
          faces: [wide],
        }),
      ),
    ).toBe(false);
  });

  it('matches similar faces with similar framing when hashes differ', () => {
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
          perceptualHash: '1111111111111111',
          faces: [faceA],
        }),
        makePhoto({
          photoId: 'b',
          perceptualHash: 'ffffffffffffffff',
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
        capturedAt: t0,
        starRating: 5,
        perceptualHash: 'aaaaaaaaaaaaaaaa',
      }),
      dup: makePhoto({
        photoId: 'dup',
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
        capturedAt: t0,
        starRating: 5,
        perceptualHash: 'aaaaaaaaaaaaaaaa',
      }),
      later: makePhoto({
        photoId: 'later',
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
        capturedAt: t0,
        starRating: 4,
        perceptualHash: '1111111111111111',
        faces: [closeUp],
      }),
      wide: makePhoto({
        photoId: 'wide',
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
});
