import {
  APP_BUILD_ID,
  APP_VERSION,
  GIT_SHA,
} from '../src/lib/config/constants';
import {appBuildProperties} from '../src/lib/observability/posthogClient';

describe('app build identity', () => {
  it('exposes version fields for PostHog identify', () => {
    expect(APP_VERSION.length).toBeGreaterThan(0);
    expect(APP_BUILD_ID.length).toBeGreaterThan(0);
    expect(GIT_SHA.length).toBeGreaterThan(0);
  });

  it('attaches version, build id, git sha, and platform', () => {
    const properties = appBuildProperties();
    expect(properties.appVersion).toBe(APP_VERSION);
    expect(properties.appBuildId).toBe(APP_BUILD_ID);
    expect(properties.gitSha).toBe(GIT_SHA);
    expect(properties.platform.length).toBeGreaterThan(0);
  });
});
