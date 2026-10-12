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

  it('labels large frontal shut+glasses glare as closed', () => {
    expect(
      classifyEyeStatus(
        {
          value: false,
          confidence: 92,
          leftProbability: 0.49,
          rightProbability: 0.83,
        },
        undefined,
        0.022,
      ),
    ).toBe('closed');
  });

  it('does not soft-close speaking/side-gaze asymmetry below glare floor', () => {
    // TR5_1080-style speaker asymmetry — open/looking, not shut+glare.
    expect(
      classifyEyeStatus(
        {
          value: true,
          confidence: 72,
          leftProbability: 0.401,
          rightProbability: 0.793,
        },
        undefined,
        0.021,
      ),
    ).toBe('partial');
    // DSC04792 side-gaze — one SCRFD eye crop collapsed.
    expect(
      classifyEyeStatus(
        {
          value: true,
          confidence: 72,
          leftProbability: 0.779,
          rightProbability: 0.005,
        },
        undefined,
        0.015,
      ),
    ).toBe('partial');
  });

  it('does not soft-close bilateral mid-band without asymmetry', () => {
    expect(
      classifyEyeStatus(
        {
          value: true,
          confidence: 72,
          leftProbability: 0.48,
          rightProbability: 0.52,
        },
        undefined,
        0.022,
      ),
    ).toBe('partial');
  });

  it('keeps clear bilateral open on large frontal faces', () => {
    expect(
      classifyEyeStatus(
        {
          value: true,
          confidence: 90,
          leftProbability: 0.95,
          rightProbability: 0.94,
        },
        undefined,
        0.022,
      ),
    ).toBe('open');
  });

  it('labels large frontal bilateral shut as closed', () => {
    expect(
      classifyEyeStatus(
        {
          value: false,
          confidence: 92,
          leftProbability: 0.05,
          rightProbability: 0.08,
        },
        undefined,
        0.022,
      ),
    ).toBe('closed');
  });

  it('labels large frontal mild squint below open bar as partial', () => {
    expect(
      classifyEyeStatus(
        {
          value: true,
          confidence: 72,
          leftProbability: 0.908,
          rightProbability: 0.935,
        },
        undefined,
        0.017,
      ),
    ).toBe('partial');
  });
});

describe('classifyFocus', () => {
  it('uses SCRFD-era sharpness thresholds', () => {
    expect(classifyFocus(65)).toBe('good');
    expect(classifyFocus(64)).toBe('soft');
    expect(classifyFocus(40)).toBe('soft');
    expect(classifyFocus(39)).toBe('blurred');
  });
});
