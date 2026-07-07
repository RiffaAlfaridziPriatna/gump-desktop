import React from 'react';
import {View, type ViewProps} from 'react-native';

type ScreenProps = ViewProps & {
  enabled?: boolean;
  active?: boolean | number;
  activityState?: boolean | number;
};

export function enableScreens() {}

export function enableFreeze() {}

export function screensEnabled() {
  return false;
}

export function freezeEnabled() {
  return false;
}

export function Screen(props: ScreenProps) {
  return <View {...props} />;
}

export const InnerScreen = Screen;
export const ScreenContext = React.createContext(null);

export function ScreenContainer(props: ViewProps) {
  return <View {...props} />;
}

export const ScreenStack = View;
export const ScreenStackItem = View;
export const FullWindowOverlay = View;
export const ScreenFooter = View;
export const ScreenContentWrapper = View;
export const ScreenStackHeaderConfig = View;
export const ScreenStackHeaderSubview = View;
export const ScreenStackHeaderLeftView = View;
export const ScreenStackHeaderCenterView = View;
export const ScreenStackHeaderRightView = View;
export const ScreenStackHeaderBackButtonImage = View;
export const ScreenStackHeaderSearchBarView = View;
export const SearchBar = View;

export default {
  enableScreens,
  enableFreeze,
  screensEnabled,
  freezeEnabled,
  Screen,
  InnerScreen,
  ScreenContext,
  ScreenContainer,
  ScreenStack,
  ScreenStackItem,
  FullWindowOverlay,
  ScreenFooter,
  ScreenContentWrapper,
  ScreenStackHeaderConfig,
  ScreenStackHeaderSubview,
  ScreenStackHeaderLeftView,
  ScreenStackHeaderCenterView,
  ScreenStackHeaderRightView,
  ScreenStackHeaderBackButtonImage,
  ScreenStackHeaderSearchBarView,
  SearchBar,
};
