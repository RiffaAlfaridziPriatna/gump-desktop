import {NativeModules, Platform} from 'react-native';

type StartupLogger = {
  appendStartupLog?: (message: string) => void;
};

function writeStartupLog(message: string): void {
  try {
    const native = NativeModules.GumpLocalStorage as StartupLogger | undefined;
    native?.appendStartupLog?.(message);
  } catch {
    // Never throw from diagnostics.
  }
}

/**
 * Release Hermes builds do not reliably forward console.* to NativeLogger.
 * Write breadcrumbs to %LocalAppData%\\GumpDesktop\\react-native.log via native.
 *
 * IMPORTANT: never call REACT_SYNC_METHOD synchronously during React render —
 * that can deadlock RNW Composition. Always defer off the render stack.
 */
export function startupLog(message: string): void {
  if (Platform.OS !== 'windows') {
    if (__DEV__) {
      console.warn(`[gump] ${message}`);
    }
    return;
  }

  const run = () => writeStartupLog(message);
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(run);
  } else {
    setTimeout(run, 0);
  }
}
