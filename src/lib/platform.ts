import {Platform} from 'react-native';

export const DESKTOP_PLATFORMS = ['macos', 'windows'] as const;
export const MOBILE_PLATFORMS = ['ios', 'android'] as const;

export function isDesktopPlatform(): boolean {
  return DESKTOP_PLATFORMS.includes(
    Platform.OS as (typeof DESKTOP_PLATFORMS)[number],
  );
}

export function isMobilePlatform(): boolean {
  return MOBILE_PLATFORMS.includes(
    Platform.OS as (typeof MOBILE_PLATFORMS)[number],
  );
}

export const BREAKPOINTS = {
  mobile: 480,
  tablet: 768,
  desktop: 1024,
} as const;

export const DESKTOP_BREAKPOINT = BREAKPOINTS.tablet;

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export function getDeviceTypeFromWidth(width: number): DeviceType {
  if (width < BREAKPOINTS.tablet) return 'mobile';
  if (width < BREAKPOINTS.desktop) return 'tablet';
  return 'desktop';
}

export const SCREEN_PADDING = {
  mobile: 16,
  tablet: 24,
  desktop: 48,
} as const;

export function getScreenPaddingHorizontal(deviceType: DeviceType): number {
  return SCREEN_PADDING[deviceType];
}

export function getAlbumGridColumns(deviceType: DeviceType): number {
  switch (deviceType) {
    case 'mobile':
      return 2;
    case 'tablet':
      return 3;
    default:
      return 4;
  }
}
