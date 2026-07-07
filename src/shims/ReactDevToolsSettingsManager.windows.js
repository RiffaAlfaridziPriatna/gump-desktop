/**
 * RN 0.81 ships ReactDevToolsSettingsManager for ios/android only.
 * Windows bundles need a no-op stub so Metro can finish setUpReactDevTools.
 */

export function setGlobalHookSettings(_settings) {}

export function getGlobalHookSettings() {
  return null;
}
