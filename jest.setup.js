require('reflect-metadata');

jest.mock('@react-native-community/blur', () => {
  const React = require('react');
  const {View} = require('react-native');
  return {
    BlurView: ({children, ...props}) =>
      React.createElement(View, props, children),
  };
});
