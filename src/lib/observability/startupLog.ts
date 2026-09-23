import {NativeModules, Platform} from 'react-native';

type StartupLogger = {
  appendStartupLog?: (message: string) => void;
};

/**
 * Release Hermes builds do not reliably forward console.* to NativeLogger.
 * Write breadcrumbs to %LocalAppData%\\GumpDesktop\\react-native.log via native.
 */
export function startupLog(message: string): void {
  if (Platform.OS !== 'windows') {
    if (__DEV__) {
      console.warn(`[gump] ${message}`);
    }
    return;
  }

  try {
    const native = NativeModules.GumpLocalStorage as StartupLogger | undefined;
    native?.appendStartupLog?.(message);
  } catch {
    // Never throw from diagnostics.
  }
}
