import React from 'react';
import {ActivityIndicator} from 'react-native';
import {render} from './helpers/render';

jest.mock('react-native-gesture-handler', () => {
  const {View} = require('react-native');
  return {GestureHandlerRootView: View};
});

jest.mock('@tanstack/react-query', () => {
  const React = require('react');
  return {
    QueryClient: class QueryClient {},
    QueryClientProvider: ({children}: {children: React.ReactNode}) => children,
  };
});

jest.mock('@context/error', () => {
  const React = require('react');
  return {
    ErrorProvider: ({children}: {children: React.ReactNode}) => children,
  };
});

jest.mock('@context/auth', () => {
  const React = require('react');
  return {
    AuthProvider: ({children}: {children: React.ReactNode}) => children,
    useAuthState: (selector: (state: {isLoading: boolean; isAuthenticated: boolean}) => unknown) =>
      selector({isLoading: true, isAuthenticated: false}),
  };
});

jest.mock('@context/culledAlbum', () => {
  const React = require('react');
  return {
    CulledAlbumProvider: ({children}: {children: React.ReactNode}) => children,
  };
});

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    NavigationContainer: ({children}: {children: React.ReactNode}) => children,
    DefaultTheme: {colors: {}},
  };
});

jest.mock('../src/app/AuthNavigator', () => ({
  AuthNavigator: () => null,
}));

jest.mock('../src/app/MainNavigator', () => ({
  MainNavigator: () => null,
}));

jest.mock('@components/error', () => ({
  ErrorToast: () => null,
}));

import App from '../src/app/App';

test('shows a loading spinner while auth is resolving', () => {
  const {renderer, unmount} = render(<App />);
  expect(renderer.root.findByType(ActivityIndicator)).toBeTruthy();
  unmount();
});
