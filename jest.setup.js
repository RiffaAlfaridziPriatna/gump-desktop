require('reflect-metadata');

jest.mock('posthog-react-native', () => {
  const React = require('react');
  class PostHog {
    captureException() {}
    identify() {}
    reset() {}
  }
  return {
    __esModule: true,
    default: PostHog,
    PostHog,
    PostHogProvider: ({children}) => children,
    PostHogErrorBoundary: ({children}) => children,
    usePostHog: () => null,
  };
});

jest.mock('@react-native-community/blur', () => {
  const React = require('react');
  const {View} = require('react-native');
  return {
    BlurView: ({children, ...props}) =>
      React.createElement(View, props, children),
  };
});
