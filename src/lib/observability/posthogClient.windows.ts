import {
  APP_BUILD_ID,
  APP_VERSION,
  GIT_SHA,
} from '@lib/config/constants';
import {Platform} from 'react-native';

/**
 * PostHog React Native is not an officially supported Windows target.
 * This platform file keeps the SDK out of the Windows Metro graph entirely.
 */
export const isPostHogEnabled = false;

export const posthog = null;

export function appBuildProperties(): Record<string, string> {
  return {
    appVersion: APP_VERSION,
    appBuildId: APP_BUILD_ID,
    gitSha: GIT_SHA,
    platform: Platform.OS,
  };
}

export function identifyUser(_user: {
  id: string;
  email?: string | null;
  name?: string;
  role?: string;
}): void {}

export function resetIdentifiedUser(): void {}

export function addErrorStep(
  _message: string,
  _properties?: Record<string, string | number | boolean | null>,
): void {}

export function captureAppEvent(
  _event: string,
  _properties?: Record<string, string | number | boolean | null>,
): void {}
