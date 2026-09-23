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
 * Defer off the React render stack — sync native calls during Fabric commit
 * can deadlock on Windows.
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
