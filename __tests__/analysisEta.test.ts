import {
  estimateMinutesLeft,
  formatEtaLabel,
} from '../src/lib/culledAlbum/analysisEta';

describe('estimateMinutesLeft', () => {
  it('is null until enough photos finished', () => {
    expect(
      estimateMinutesLeft({completedSinceStart: 4, elapsedMs: 4000, remaining: 100}),
    ).toBeNull();
  });

  it('is null with no elapsed time or nothing remaining', () => {
    expect(
      estimateMinutesLeft({completedSinceStart: 10, elapsedMs: 0, remaining: 100}),
    ).toBeNull();
    expect(
      estimateMinutesLeft({completedSinceStart: 10, elapsedMs: 1000, remaining: 0}),
    ).toBeNull();
  });

  it('extrapolates the pace and rounds up to whole minutes', () => {
    expect(
      estimateMinutesLeft({completedSinceStart: 10, elapsedMs: 10000, remaining: 100}),
    ).toBe(2);
  });

  it('never goes below one minute', () => {
    expect(
      estimateMinutesLeft({completedSinceStart: 50, elapsedMs: 10000, remaining: 1}),
    ).toBe(1);
  });
});

describe('formatEtaLabel', () => {
  it('matches the Figma copy', () => {
    expect(formatEtaLabel(40)).toBe('About 40 min left');
  });
});
