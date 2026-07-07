import React, {PropsWithChildren, useContext} from 'react';
import {Dimensions, View, type ViewProps} from 'react-native';

const {width = 0, height = 0} = Dimensions.get('window');

const defaultInsets = {top: 0, right: 0, bottom: 0, left: 0};
const defaultFrame = {x: 0, y: 0, width, height};

export const SafeAreaInsetsContext =
  React.createContext<typeof defaultInsets | null>(null);
export const SafeAreaFrameContext =
  React.createContext<typeof defaultFrame | null>(null);

export const initialWindowMetrics = {
  frame: defaultFrame,
  insets: defaultInsets,
};

export const initialWindowSafeAreaInsets = defaultInsets;

export function SafeAreaProvider({
  children,
  style,
  ...rest
}: PropsWithChildren<ViewProps>) {
  return (
    <SafeAreaInsetsContext.Provider value={defaultInsets}>
      <SafeAreaFrameContext.Provider value={defaultFrame}>
        <View style={[{flex: 1}, style]} {...rest}>
          {children}
        </View>
      </SafeAreaFrameContext.Provider>
    </SafeAreaInsetsContext.Provider>
  );
}

export function SafeAreaView({style, ...rest}: ViewProps) {
  return <View style={style} {...rest} />;
}

export function useSafeAreaInsets() {
  return useContext(SafeAreaInsetsContext) ?? defaultInsets;
}

export function useSafeAreaFrame() {
  return useContext(SafeAreaFrameContext) ?? defaultFrame;
}

export function useSafeArea() {
  return {insets: useSafeAreaInsets(), frame: useSafeAreaFrame()};
}

export const NativeSafeAreaProvider = View;
export const NativeSafeAreaView = View;
