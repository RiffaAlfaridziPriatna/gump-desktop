import {Platform} from 'react-native';

export const WINDOWS_YUNET_ENGINE_VERSION = 'windows-yunet-1';
export const MACOS_VISION_ENGINE_VERSION = 'macos-vision-1';
export const FALLBACK_ENGINE_VERSION = 'fallback-1';

export function currentAnalysisEngineVersion(): string {
  switch (Platform.OS) {
    case 'windows':
      return WINDOWS_YUNET_ENGINE_VERSION;
    case 'macos':
    case 'ios':
      return MACOS_VISION_ENGINE_VERSION;
    default:
      return FALLBACK_ENGINE_VERSION;
  }
}

export function needsReanalysisForEngine(
  analysisEngineVersion: string | null | undefined,
): boolean {
  if (!analysisEngineVersion) {
    return true;
  }
  return analysisEngineVersion !== currentAnalysisEngineVersion();
}
