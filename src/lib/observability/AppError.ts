export type ErrorContext = Record<string, unknown>;

/**
 * Application error that preserves the original failure (`cause`) and structured
 * context (album, photo, file, HTTP, etc.) for error tracking.
 */
export class AppError extends Error {
  readonly context: ErrorContext;

  constructor(
    message: string,
    options: {cause?: unknown; context?: ErrorContext; name?: string} = {},
  ) {
    super(message);
    this.name = options.name ?? 'AppError';
    this.context = options.context ?? {};
    if (options.cause !== undefined) {
      (this as Error & {cause?: unknown}).cause = options.cause;
    }
  }
}

export function wrapError(
  error: unknown,
  message: string,
  context?: ErrorContext,
): AppError {
  if (error instanceof AppError) {
    return new AppError(message, {
      cause: error,
      context: {...error.context, ...context},
      name: error.name,
    });
  }

  const originalMessage = getErrorMessage(error);
  const combined =
    originalMessage && originalMessage !== message
      ? `${message}: ${originalMessage}`
      : message;

  return new AppError(combined, {cause: error, context});
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.length > 0) {
    return error;
  }
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as {message: unknown}).message === 'string'
  ) {
    return (error as {message: string}).message;
  }
  return '';
}
