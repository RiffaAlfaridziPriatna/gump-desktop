import {Platform} from 'react-native';
import {AppError, getErrorMessage} from './AppError';
import {serializeError} from './serializeError';

export type ErrorCaptureClient = {
  captureException: (
    error: Error | unknown,
    additionalProperties?: Record<string, unknown>,
  ) => void;
};

const IGNORED_MESSAGES = new Set([
  'Upload cancelled',
  'Analysis cancelled',
]);

let captureClient: ErrorCaptureClient | null = null;
const reported = new WeakSet<object>();
let consolePatched = false;
let originalConsoleError: typeof console.error | null = null;

export function setErrorCaptureClient(client: ErrorCaptureClient | null): void {
  captureClient = client;
}

export function reportError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (isIgnored(error, context)) {
    return;
  }

  if (hasReported(error)) {
    return;
  }
  markReported(error);

  const properties = {
    ...serializeError(error, context),
    platform: Platform.OS,
  };

  try {
    captureClient?.captureException(toCapturableError(error), properties);
  } catch {
    // Never throw from the reporter.
  }
}

export function installGlobalErrorReporting(): void {
  if (consolePatched) {
    return;
  }
  consolePatched = true;
  originalConsoleError = console.error.bind(console);

  console.error = (...args: unknown[]) => {
    originalConsoleError?.(...(args as Parameters<typeof console.error>));
    reportConsoleError(args);
  };
}

export function uninstallGlobalErrorReporting(): void {
  if (!consolePatched) {
    return;
  }
  if (originalConsoleError) {
    console.error = originalConsoleError;
  }
  originalConsoleError = null;
  consolePatched = false;
}

function reportConsoleError(args: unknown[]): void {
  const errorArg = args.find(
    arg => arg instanceof Error || arg instanceof AppError,
  );
  if (errorArg) {
    reportError(errorArg, {source: 'console.error'});
    return;
  }

  const first = args[0];
  if (typeof first === 'string' && first.startsWith('[')) {
    const message = args
      .map(arg => (typeof arg === 'string' ? arg : getErrorMessage(arg) || ''))
      .filter(Boolean)
      .join(' ');
    reportError(new Error(message), {source: 'console.error'});
  }
}

function isIgnored(
  error: unknown,
  context?: Record<string, unknown>,
): boolean {
  const message = getErrorMessage(error);
  if (IGNORED_MESSAGES.has(message)) {
    return true;
  }
  const contextMessage = context?.error;
  return typeof contextMessage === 'string' && IGNORED_MESSAGES.has(contextMessage);
}

function hasReported(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && reported.has(error));
}

function markReported(error: unknown): void {
  if (error && typeof error === 'object') {
    reported.add(error);
  }
  const capturable = toCapturableError(error);
  if (capturable !== error) {
    reported.add(capturable);
  }
}

function toCapturableError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  if (typeof error === 'string') {
    return new Error(error);
  }
  const message = getErrorMessage(error);
  const wrapped = new Error(message || 'Unknown error');
  wrapped.name =
    error &&
    typeof error === 'object' &&
    'name' in error &&
    typeof (error as {name: unknown}).name === 'string'
      ? (error as {name: string}).name
      : 'Error';
  return wrapped;
}
