import type {PropsWithChildren} from 'react';

/**
 * Windows has no PostHogProvider (HTTP client in posthogClient.windows.ts).
 */
export function PostHogAppShell({children}: PropsWithChildren) {
  return children;
}
