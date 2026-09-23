import {
  APP_BUILD_ID,
  APP_VERSION,
  GIT_SHA,
  POSTHOG_API_KEY,
  POSTHOG_HOST,
} from '@lib/config/constants';
import type {PostHog} from 'posthog-react-native';
import {Platform} from 'react-native';
import type {ErrorCaptureClient} from './reportError';
import {setErrorCaptureClient} from './reportError';

/**
 * Windows Release has repeatedly hung / whitescreened when posthog-react-native
 * loads at startup (RNLocalize turbo module, provider first paint). Keep
 * analytics on macOS/mobile only until Windows is stable.
 */
export const isPostHogEnabled =
  Platform.OS !== 'windows' && POSTHOG_API_KEY.length > 0;

function createPostHogClient(): PostHog | null {
  if (!isPostHogEnabled) {
    return null;
  }
  // Dynamic require so Windows never evaluates posthog-react-native.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const {PostHog: PostHogCtor} = require('posthog-react-native') as {
    PostHog: new (
      apiKey: string,
      options: Record<string, unknown>,
    ) => PostHog;
  };
  return new PostHogCtor(POSTHOG_API_KEY, {
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

export const posthog: PostHog | null = createPostHogClient();

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
