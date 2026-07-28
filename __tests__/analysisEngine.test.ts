import {
  currentAnalysisEngineVersion,
  needsReanalysisForEngine,
  SCRFD_OCEC_ENGINE_VERSION,
  WINDOWS_YUNET_ENGINE_VERSION,
} from '../src/lib/culling/analysisEngine';

jest.mock('react-native', () => ({
  Platform: {OS: 'windows'},
}));

describe('analysisEngine', () => {
  it('reports the shared SCRFD plus OCEC engine version on Windows', () => {
    expect(currentAnalysisEngineVersion()).toBe(SCRFD_OCEC_ENGINE_VERSION);
  });

  it('flags missing or outdated analysis for reanalysis', () => {
    expect(needsReanalysisForEngine(null)).toBe(true);
    expect(needsReanalysisForEngine('windows-winrt-1')).toBe(true);
    expect(needsReanalysisForEngine(WINDOWS_YUNET_ENGINE_VERSION)).toBe(true);
    expect(needsReanalysisForEngine('scrfd-ocec-1')).toBe(true);
    expect(needsReanalysisForEngine('scrfd-ocec-2')).toBe(true);
    expect(needsReanalysisForEngine('scrfd-ocec-3')).toBe(true);
    expect(needsReanalysisForEngine('scrfd-ocec-4')).toBe(true);
    expect(needsReanalysisForEngine('scrfd-ocec-5')).toBe(true);
    expect(needsReanalysisForEngine('scrfd-ocec-6')).toBe(true);
    expect(needsReanalysisForEngine('scrfd-ocec-7')).toBe(true);
    expect(needsReanalysisForEngine(SCRFD_OCEC_ENGINE_VERSION)).toBe(false);
  });
});
