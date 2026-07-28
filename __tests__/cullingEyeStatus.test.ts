import {classifyEyeStatus, classifyFocus} from '../src/lib/culling/cullingUtil';

jest.mock('@lib/culledAlbum/photoStateStore', () => ({
  photoStateStore: {
    getState: () => ({photoOrder: {}}),
  },
}));

describe('classifyEyeStatus', () => {
  it('keeps missing results uncertain', () => {
    expect(classifyEyeStatus()).toBe('partial');
  });

  it('prefers open when eye probabilities are mixed (glasses / side gaze)', () => {
    expect(
      classifyEyeStatus({
        value: false,
        confidence: 90,
        leftProbability: 0.72,
        rightProbability: 0.38,
      }),
    ).toBe('open');
    expect(
      classifyEyeStatus({
        value: false,
        confidence: 90,
        leftProbability: 0.55,
        rightProbability: 0.5,
      }),
    ).toBe('open');
  });

  it('requires both eyes closed before labeling closed', () => {
    expect(
      classifyEyeStatus({
        value: false,
        confidence: 95,
        leftProbability: 0.12,
        rightProbability: 0.18,
      }),
    ).toBe('closed');
    expect(
      classifyEyeStatus({
        value: false,
        confidence: 95,
        leftProbability: 0.1,
        rightProbability: 0.45,
      }),
    ).toBe('partial');
  });

  it('falls back to asymmetric confidence thresholds without probabilities', () => {
    expect(classifyEyeStatus({value: true, confidence: 70})).toBe('open');
    expect(classifyEyeStatus({value: true, confidence: 69})).toBe('partial');
    expect(classifyEyeStatus({value: false, confidence: 88})).toBe('closed');
    expect(classifyEyeStatus({value: false, confidence: 87})).toBe('partial');
    expect(classifyEyeStatus({value: false, confidence: 0})).toBe('partial');
  });

  it('maps crowd open-bias with near-zero lids to open', () => {
    expect(
      classifyEyeStatus({
        value: true,
        confidence: 72,
        leftProbability: 0.02,
        rightProbability: 0.01,
      }),
    ).toBe('open');
  });

  it('keeps soft mid-band as partial only when both lids are weakly present', () => {
    expect(
      classifyEyeStatus({
        value: true,
        confidence: 74,
        leftProbability: 0.28,
        rightProbability: 0.12,
      }),
    ).toBe('partial');
    expect(
      classifyEyeStatus({
        value: true,
        confidence: 74,
        leftProbability: 0.28,
        rightProbability: 0.06,
      }),
    ).toBe('open');
    expect(
      classifyEyeStatus({
        value: true,
        confidence: 86,
        leftProbability: 0.28,
        rightProbability: 0.06,
      }),
    ).toBe('open');
  });

  it('keeps strong closed on large faces (singer)', () => {
    expect(
      classifyEyeStatus({
        value: false,
        confidence: 98.5,
        leftProbability: 0,
        rightProbability: 0.004,
      }),
    ).toBe('closed');
  });
});

describe('classifyFocus', () => {
  it('uses SCRFD-era sharpness thresholds', () => {
    expect(classifyFocus(62)).toBe('good');
    expect(classifyFocus(61)).toBe('soft');
    expect(classifyFocus(40)).toBe('soft');
    expect(classifyFocus(39)).toBe('blurred');
  });
});
