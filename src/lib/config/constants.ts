export const API_BASE_URL =
  process.env.API_BASE_URL ?? 'http://localhost:3000';

export const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY ?? '';
export const POSTHOG_HOST =
  process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com';

/** Marketing version (`CFBundleShortVersionString`). Stable across builds. */
export const APP_VERSION = process.env.APP_VERSION ?? '1.0';

/** Unique per release bundle: `{gitSha}-{unixSeconds}`. `dev` when Metro has no build env. */
export const APP_BUILD_ID = process.env.APP_BUILD_ID ?? 'dev';

export const GIT_SHA = process.env.GIT_SHA ?? 'unknown';

