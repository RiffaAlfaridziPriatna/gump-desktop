export const API_BASE_URL =
  process.env.API_BASE_URL ?? 'http://localhost:3000';

export const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY ?? '';
export const POSTHOG_HOST =
  process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com';

/** Marketing version from VERSION.macos / VERSION.windows (inlined at bundle time). */
export const APP_VERSION = process.env.APP_VERSION ?? '1.0.0';

/**
 * Build channel: `prod` | `local` | `staging`.
 * Forced from GUMP_ENV / which dotenv file was loaded. Defaults to `local` under Metro.
 */
export const APP_BUILD_ID = process.env.APP_BUILD_ID ?? 'local';

/** Short git SHA resolved at `npm run build*` / `npm run macos`. */
export const GIT_SHA = process.env.GIT_SHA ?? 'unknown';

