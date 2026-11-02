const config = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
  moduleNameMapper: {
    '\\.svg$': '<rootDir>/__tests__/mocks/svgMock.js',
  },
};

const windowsConfig = require('@rnx-kit/jest-preset')('windows', config);

// A user setupFiles would replace the preset's react-native-windows setup, so append instead.
windowsConfig.setupFiles = [
  ...windowsConfig.setupFiles,
  '<rootDir>/jest.env.js',
];

// The preset appends user transformIgnorePatterns after its own, and Jest skips a file if any pattern matches, so replace it.
windowsConfig.transformIgnorePatterns = [
  'node_modules/(?!((jest-)?react-native(-macos)?|@react-native(-community)?|@office-iss/react-native-win32|@?react-native-windows|@react-native-async-storage|react-native-svg|zustand|immer|tsyringe)/)',
];

module.exports = windowsConfig;
