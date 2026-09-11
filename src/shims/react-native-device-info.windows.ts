/**
 * Windows New Arch cannot link react-native-device-info (UWP-only native project).
 * PostHog treats this peer as optional and ignores "unknown" values.
 */
const unknown = 'unknown';

function syncUnknown() {
  return unknown;
}

export function getBuildNumber() {
  return unknown;
}

export function getApplicationName() {
  return unknown;
}

export function getBundleId() {
  return unknown;
}

export function getVersion() {
  return unknown;
}

export function getManufacturerSync() {
  return unknown;
}

export function getModel() {
  return unknown;
}

export function getSystemName() {
  return unknown;
}

export function getSystemVersion() {
  return unknown;
}

export function isEmulatorSync() {
  return false;
}

export function getUniqueId() {
  return unknown;
}

export function getUniqueIdSync() {
  return unknown;
}

export default {
  getBuildNumber,
  getApplicationName,
  getBundleId,
  getVersion,
  getManufacturerSync,
  getModel,
  getSystemName,
  getSystemVersion,
  isEmulatorSync,
  getUniqueId,
  getUniqueIdSync,
  getManufacturer: syncUnknown,
};
