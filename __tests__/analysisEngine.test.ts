import {
  currentAnalysisEngineVersion,
  needsReanalysisForEngine,
  WINDOWS_YUNET_ENGINE_VERSION,
} from '../src/lib/culling/analysisEngine';

jest.mock('react-native', () => ({
  Platform: {OS: 'windows'},
}));

describe('analysisEngine', () => {
  it('reports the Windows YuNet engine version', () => {
    expect(currentAnalysisEngineVersion()).toBe(WINDOWS_YUNET_ENGINE_VERSION);
  });

  it('flags missing or outdated analysis for reanalysis', () => {
    expect(needsReanalysisForEngine(null)).toBe(true);
    expect(needsReanalysisForEngine('windows-winrt-1')).toBe(true);
    expect(needsReanalysisForEngine(WINDOWS_YUNET_ENGINE_VERSION)).toBe(false);
  });
});
