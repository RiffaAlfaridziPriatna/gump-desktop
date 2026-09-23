import type {PropsWithChildren} from 'react';
import {PostHogProvider} from 'posthog-react-native';
import {isPostHogEnabled, posthog} from './posthogClient';

/** Wraps the app with PostHog when the SDK is configured for this platform. */
export function PostHogAppShell({children}: PropsWithChildren) {
  if (!isPostHogEnabled || !posthog) {
    return children;
  }

  return (
    <PostHogProvider client={posthog} autocapture={false}>
      {children}
    </PostHogProvider>
  );
}
