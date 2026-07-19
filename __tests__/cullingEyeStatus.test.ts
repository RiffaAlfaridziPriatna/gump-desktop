import {classifyEyeStatus} from '../src/lib/culling/cullingUtil';

jest.mock('@lib/culledAlbum/photoStateStore', () => ({
  photoStateStore: {
    getState: () => ({photoOrder: {}}),
  },
}));

describe('classifyEyeStatus', () => {
  it('keeps missing and low-confidence results uncertain', () => {
    expect(classifyEyeStatus()).toBe('partial');
    expect(classifyEyeStatus({value: true, confidence: 84.99})).toBe(
      'partial',
    );
    expect(classifyEyeStatus({value: false, confidence: 0})).toBe('partial');
  });

  it('accepts open and closed results at the confidence boundary', () => {
    expect(classifyEyeStatus({value: true, confidence: 85})).toBe('open');
    expect(classifyEyeStatus({value: false, confidence: 85})).toBe('closed');
  });
});
