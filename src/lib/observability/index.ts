export {AppError, wrapError, getErrorMessage} from './AppError';
export type {ErrorContext} from './AppError';
export {
  describeFileUri,
  serializeError,
  sanitizeContext,
} from './serializeError';
export {
  reportError,
  installGlobalErrorReporting,
  uninstallGlobalErrorReporting,
  setErrorCaptureClient,
} from './reportError';
export type {ErrorCaptureClient} from './reportError';
export {
  posthog,
  isPostHogEnabled,
  identifyUser,
  resetIdentifiedUser,
} from './posthogClient';
