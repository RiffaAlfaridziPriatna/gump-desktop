module.exports = {
  preset: 'react-native',
  setupFiles: ['<rootDir>/jest.env.js'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
  moduleNameMapper: {
    '\\.svg$': '<rootDir>/__tests__/mocks/svgMock.js',
  },
  testPathIgnorePatterns: [
    '/node_modules/',
    '/macos/',
    '/ios/',
    '/android/',
    '/windows/',
    '/cpp/',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-svg|zustand|immer|tsyringe)/)',
  ],
};
