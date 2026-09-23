import {
  APP_BUILD_ID,
  APP_VERSION,
  GIT_SHA,
  POSTHOG_API_KEY,
  POSTHOG_HOST,
} from '@lib/config/constants';
import {PostHog} from 'posthog-react-native';
import {Platform} from 'react-native';
import type {ErrorCaptureClient} from './reportError';
import {setErrorCaptureClient} from './reportError';

export const isPostHogEnabled = POSTHOG_API_KEY.length > 0;

export const posthog: PostHog | null = isPostHogEnabled
  ? new PostHog(POSTHOG_API_KEY, {
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
    })
  : null;

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
