import {
  beginTimedFlow,
  cullingFlowKey,
  endTimedFlow,
  localImportFlowKey,
  serverUploadFlowKey,
} from '../src/lib/observability/flowTiming';

describe('flowTiming', () => {
  it('tracks duration and properties for a flow key', () => {
    beginTimedFlow(localImportFlowKey('a1'), {
      source: 'create',
      autoStartAnalysis: false,
    });

    const result = endTimedFlow(localImportFlowKey('a1'));

    expect(result.properties).toEqual({
      source: 'create',
      autoStartAnalysis: false,
    });
    expect(result.durationMs).toEqual(expect.any(Number));
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('clears state after end and returns null duration when missing', () => {
    beginTimedFlow(cullingFlowKey('a1'));
    endTimedFlow(cullingFlowKey('a1'));

    expect(endTimedFlow(cullingFlowKey('a1'))).toEqual({
      durationMs: null,
      properties: {},
    });
    expect(endTimedFlow(serverUploadFlowKey('missing'))).toEqual({
      durationMs: null,
      properties: {},
    });
  });
});
