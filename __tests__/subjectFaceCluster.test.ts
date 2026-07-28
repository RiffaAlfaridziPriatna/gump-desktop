import {selectDominantFaceCluster} from '../src/lib/culling/subjectFaceCluster';

type TestFace = {
  id: string;
  boundingBox: {left: number; top: number; width: number; height: number};
  sharpness?: number;
  pose?: {yaw?: number};
};

function face(
  id: string,
  box: TestFace['boundingBox'],
  sharpness = 70,
): TestFace {
  return {id, boundingBox: box, sharpness};
}

describe('selectDominantFaceCluster', () => {
  it('returns the single face unchanged', () => {
    const only = face('a', {left: 0.3, top: 0.2, width: 0.3, height: 0.35});
    expect(selectDominantFaceCluster([only])).toEqual([only]);
  });

  it('keeps a formal group of similar-sized faces', () => {
    const group: TestFace[] = [];
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 8; col++) {
        group.push(
          face(
            `g-${row}-${col}`,
            {
              left: 0.08 + col * 0.11,
              top: 0.28 + row * 0.18,
              width: 0.08,
              height: 0.1,
            },
            65 + (col % 3),
          ),
        );
      }
    }

    const kept = selectDominantFaceCluster(group);
    expect(kept).toHaveLength(group.length);
    expect(kept.map(item => item.id)).toEqual(group.map(item => item.id));
  });

  it('drops tiny background faces behind a large subject', () => {
    const subject = face(
      'subject',
      {left: 0.35, top: 0.2, width: 0.28, height: 0.36},
      80,
    );
    const backgroundA = face(
      'bg-a',
      {left: 0.7, top: 0.35, width: 0.05, height: 0.06},
      25,
    );
    const backgroundB = face(
      'bg-b',
      {left: 0.1, top: 0.4, width: 0.04, height: 0.05},
      20,
    );

    const kept = selectDominantFaceCluster([subject, backgroundA, backgroundB]);
    expect(kept.map(item => item.id)).toEqual(['subject']);
  });

  it('prefers a dense similar-size group over a single photobomb close-up', () => {
    const photobomb = face(
      'photobomb',
      {left: 0.05, top: 0.55, width: 0.4, height: 0.45},
      90,
    );
    const group = [0, 1, 2, 3, 4].map(index =>
      face(
        `member-${index}`,
        {
          left: 0.15 + index * 0.12,
          top: 0.25,
          width: 0.09,
          height: 0.11,
        },
        70,
      ),
    );

    const kept = selectDominantFaceCluster([photobomb, ...group]);
    expect(kept.map(item => item.id)).toEqual(group.map(item => item.id));
    expect(kept.some(item => item.id === 'photobomb')).toBe(false);
  });

  it('drops a far edge outlier from an otherwise tight group band', () => {
    const group = [0, 1, 2, 3, 4].map(index =>
      face(
        `row-${index}`,
        {
          left: 0.2 + index * 0.1,
          top: 0.35,
          width: 0.08,
          height: 0.1,
        },
        70,
      ),
    );
    const edgeStaff = face(
      'edge-staff',
      {left: 0.92, top: 0.05, width: 0.07, height: 0.09},
      40,
    );

    const kept = selectDominantFaceCluster([...group, edgeStaff]);
    expect(kept.map(item => item.id)).toEqual(group.map(item => item.id));
  });

  it('prefers a clear foreground subject over a midground pack', () => {
    const subject = face(
      'foreground',
      {left: 0.42, top: 0.32, width: 0.2, height: 0.28},
      78,
    );
    const midground = [0, 1, 2, 3, 4, 5].map(index =>
      face(
        `crowd-${index}`,
        {
          left: 0.08 + (index % 3) * 0.18,
          top: 0.12 + Math.floor(index / 3) * 0.16,
          width: 0.09,
          height: 0.12,
        },
        48 + (index % 3),
      ),
    );

    const kept = selectDominantFaceCluster([subject, ...midground]);
    expect(kept.map(item => item.id)).toEqual(['foreground']);
  });

  it('drops a soft poster-like face that is far softer than the subject tier', () => {
    const subject = face(
      'presenter',
      {left: 0.4, top: 0.25, width: 0.16, height: 0.22},
      78,
    );
    const peer = face(
      'peer',
      {left: 0.2, top: 0.28, width: 0.14, height: 0.2},
      74,
    );
    const poster = face(
      'poster',
      {left: 0.7, top: 0.15, width: 0.15, height: 0.2},
      8,
    );

    const kept = selectDominantFaceCluster([subject, peer, poster]);
    expect(kept.map(item => item.id).sort()).toEqual(['peer', 'presenter']);
  });

  it('drops a mid-ground screen face that is only moderately softer', () => {
    const left = face(
      'left',
      {left: 0.22, top: 0.28, width: 0.14, height: 0.2},
      72,
    );
    const right = face(
      'right',
      {left: 0.52, top: 0.3, width: 0.13, height: 0.19},
      68,
    );
    const screen = face(
      'screen',
      {left: 0.38, top: 0.22, width: 0.14, height: 0.2},
      28,
    );

    const kept = selectDominantFaceCluster([left, right, screen]);
    expect(kept.map(item => item.id).sort()).toEqual(['left', 'right']);
  });

  it('keeps a 3-person same-row group when two faces clump (IMG_3714)', () => {
    const left = face(
      'white-blazer',
      {left: 0.391, top: 0.395, width: 0.049, height: 0.099},
      96,
    );
    const middle = face(
      'blue-suit',
      {left: 0.533, top: 0.381, width: 0.047, height: 0.11},
      94,
    );
    const right = face(
      'green-blazer',
      {left: 0.572, top: 0.347, width: 0.05, height: 0.12},
      79,
    );

    const kept = selectDominantFaceCluster([left, middle, right]);
    expect(kept.map(item => item.id)).toEqual([
      'white-blazer',
      'blue-suit',
      'green-blazer',
    ]);
  });

  it('drops a profile print face via yaw when peers are frontal and sharp', () => {
    const left: TestFace = {
      ...face('left', {left: 0.2, top: 0.28, width: 0.14, height: 0.2}, 74),
      pose: {yaw: 4},
    };
    const right: TestFace = {
      ...face('right', {left: 0.55, top: 0.3, width: 0.13, height: 0.19}, 70),
      pose: {yaw: -6},
    };
    const print: TestFace = {
      ...face('print', {left: 0.38, top: 0.2, width: 0.14, height: 0.2}, 48),
      pose: {yaw: 34},
    };

    const kept = selectDominantFaceCluster([left, right, print]);
    expect(kept.map(item => item.id).sort()).toEqual(['left', 'right']);
  });
});
