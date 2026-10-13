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

  it('requires near-zero lids before labeling small-face closed', () => {
    // Mild low-open crowd crop (WWW03187 / DSC05047) → partial, not closed.
    expect(
      classifyEyeStatus({
        value: false,
        confidence: 95,
        leftProbability: 0.12,
        rightProbability: 0.18,
      }),
    ).toBe('partial');
    expect(
      classifyEyeStatus(
        {
          value: false,
          confidence: 94,
          leftProbability: 0.016,
          rightProbability: 0.043,
        },
        undefined,
        0.0043,
      ),
    ).toBe('partial');
    expect(
      classifyEyeStatus({
        value: false,
        confidence: 95,
        leftProbability: 0.1,
        rightProbability: 0.45,
      }),
    ).toBe('partial');
    // Sure bilateral shut on a tiny face (both near zero).
    expect(
      classifyEyeStatus(
        {
          value: false,
          confidence: 95,
          leftProbability: 0.01,
          rightProbability: 0.015,
        },
        undefined,
        0.0011,
      ),
    ).toBe('closed');
  });

  it('scales small-face sure-closed bar with face area', () => {
    const mildLids = {
      value: false,
      confidence: 94,
      leftProbability: 0.016,
      rightProbability: 0.043,
    };
    // Mid-small (DSC05047-sized): bar still below max lid → partial.
    expect(classifyEyeStatus(mildLids, undefined, 0.0043)).toBe('partial');
    // Near large gate: bar rises enough that the same lids → closed.
    expect(classifyEyeStatus(mildLids, undefined, 0.0075)).toBe('closed');
    // Near-zero lids stay closed across the small-face range.
    expect(
      classifyEyeStatus(
        {
          value: false,
          confidence: 95,
          leftProbability: 0.005,
          rightProbability: 0.01,
        },
        undefined,
        0.006,
      ),
    ).toBe('closed');
  });

  it('falls back to asymmetric confidence thresholds without probabilities', () => {
    expect(classifyEyeStatus({value: true, confidence: 70})).toBe('open');
    expect(classifyEyeStatus({value: true, confidence: 69})).toBe('partial');
    // No probs: do not confidence-only close (false closed on crowd).
    expect(classifyEyeStatus({value: false, confidence: 88})).toBe('partial');
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

  it('labels strong lens glare (~0.42/0.96) as closed', () => {
    // Shared stb decode / Win-open bias: beyond classic soft-closed max 0.88.
    expect(
      classifyEyeStatus(
        {
          value: true,
          confidence: 72,
          leftProbability: 0.422771,
          rightProbability: 0.955894,
        },
        undefined,
        0.022,
      ),
    ).toBe('closed');
  });

  it('labels live WWW03212 glasses glare (~0.26/0.93) as closed', () => {
    expect(
      classifyEyeStatus(
        {
          value: true,
          confidence: 72,
          leftProbability: 0.255,
          rightProbability: 0.929,
        },
        undefined,
        0.022,
      ),
    ).toBe('closed');
  });

  it('labels stb-path WWW03212 glasses (~0.045/0.81) as closed', () => {
    expect(
      classifyEyeStatus(
        {
          value: true,
          confidence: 72,
          leftProbability: 0.045,
          rightProbability: 0.812,
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
    // Live stb TR5_1080 — was false-closed by wide glare; gap 0.10–0.20.
    expect(
      classifyEyeStatus(
        {
          value: true,
          confidence: 72,
          leftProbability: 0.145,
          rightProbability: 0.858,
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
