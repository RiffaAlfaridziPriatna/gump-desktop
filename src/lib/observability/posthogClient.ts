import {
  APP_BUILD_ID,
  APP_VERSION,
  GIT_SHA,
  POSTHOG_API_KEY,
  POSTHOG_HOST,
} from '@lib/config/constants';
import {Platform} from 'react-native';
import type {ErrorCaptureClient} from './reportError';
import {setErrorCaptureClient} from './reportError';

/**
 * PostHog React Native is not an officially supported Windows target (docs cover
 * iOS/Android + Web/macOS). Loading it on RNW Release hangs startup via peers
 * like react-native-localize. Keep the SDK off Windows entirely.
 */
export const isPostHogEnabled =
  Platform.OS !== 'windows' && POSTHOG_API_KEY.length > 0;

/** Minimal client surface used by this app (avoids static import of the SDK). */
type PostHogClient = {
  register: (properties: Record<string, string>) => void | Promise<void>;
  identify: (id: string, properties?: Record<string, string>) => void;
  reset: () => void;
  capture: (
    event: string,
    properties?: Record<string, string | number | boolean | null>,
  ) => void;
  flush: () => void | Promise<void>;
  addExceptionStep: (
    message: string,
    properties?: Record<string, string | number | boolean | null>,
  ) => void;
  captureException: (
    error: Error | unknown,
    additionalProperties?: Record<string, unknown>,
  ) => void;
};

function createPostHogClient(): PostHogClient | null {
  if (!isPostHogEnabled) {
    return null;
  }

  // Dynamic require so Windows never evaluates posthog-react-native.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {PostHog} = require('posthog-react-native') as {
    PostHog: new (
      apiKey: string,
      options: Record<string, unknown>,
    ) => PostHogClient;
  };

  return new PostHog(POSTHOG_API_KEY, {
    host: POSTHOG_HOST,
    captureAppLifecycleEvents: false,
    enableSessionReplay: false,
    preloadFeatureFlags: false,
    disableRemoteFeatureFlags: true,
    disableSurveys: true,
    setDefaultPersonProperties: false,
    errorTracking: {
      autocapture: {
        uncaughtExceptions: true,
        unhandledRejections: true,
        console: false,
        nativeCrashes: false,
      },
    },
  });
}

export const posthog: PostHogClient | null = createPostHogClient();

export function appBuildProperties(): Record<string, string> {
  return {
    appVersion: APP_VERSION,
    appBuildId: APP_BUILD_ID,
    gitSha: GIT_SHA,
    platform: Platform.OS,
  };
}

if (posthog) {
  setErrorCaptureClient(posthog as ErrorCaptureClient);
  void posthog.register(appBuildProperties());
}

export function identifyUser(user: {
  id: string;
  email?: string | null;
  name?: string;
  role?: string;
}): void {
  const properties: Record<string, string> = {...appBuildProperties()};
  if (user.email) {
    properties.email = user.email;
  }
  if (user.name) {
    properties.name = user.name;
  }
  if (user.role) {
    properties.role = user.role;
  }
  void posthog?.register(appBuildProperties());
  posthog?.identify(user.id, properties);
}

export function resetIdentifiedUser(): void {
  posthog?.reset();
}

export function addErrorStep(
  message: string,
  properties?: Record<string, string | number | boolean | null>,
): void {
  if (!posthog || message.trim().length === 0) {
    return;
  }
  try {
    posthog.addExceptionStep(message, properties);
  } catch {
    // Never throw from tracing.
  }
}

export function captureAppEvent(
  event: string,
  properties?: Record<string, string | number | boolean | null>,
): void {
  if (!posthog || event.trim().length === 0) {
    return;
  }
  try {
    posthog.capture(event, {...appBuildProperties(), ...properties});
    void posthog.flush();
  } catch {
    // Never throw from tracing.
  }
}
