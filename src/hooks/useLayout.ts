import {useWindowDimensions} from 'react-native';
import {
  isDesktopPlatform,
  isMobilePlatform,
  DESKTOP_BREAKPOINT,
  getDeviceTypeFromWidth,
  getScreenPaddingHorizontal,
  getAlbumGridColumns,
  DeviceType,
} from '@lib/system/platform';

type LayoutInfo = {
  isDesktopPlatform: boolean;
  isMobilePlatform: boolean;
  screenWidth: number;
  screenHeight: number;
  deviceType: DeviceType;
  isDesktopLayout: boolean;
  isMobileLayout: boolean;
  screenPaddingHorizontal: number;
  albumGridColumns: number;
};

export function useLayout(): LayoutInfo {
  const {width, height} = useWindowDimensions();
  const deviceType = getDeviceTypeFromWidth(width);

  const desktopPlatform = isDesktopPlatform();
  const mobilePlatform = isMobilePlatform();

  return {
    isDesktopPlatform: desktopPlatform,
    isMobilePlatform: mobilePlatform,
    screenWidth: width,
    screenHeight: height,
    deviceType,
    isDesktopLayout: desktopPlatform || width >= DESKTOP_BREAKPOINT,
    isMobileLayout: mobilePlatform && width < DESKTOP_BREAKPOINT,
    screenPaddingHorizontal: getScreenPaddingHorizontal(deviceType),
    albumGridColumns: getAlbumGridColumns(deviceType),
  };
}
