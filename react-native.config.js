module.exports = {
  project: {
    ios: {},
    android: {},
    windows: {},
    macos: {
      sourceDir: 'macos',
    },
  },
  assets: ['./src/assets/fonts/'],
  dependencies: {
    'react-native-screens': {
      platforms: {
        macos: null,
      },
    },
  },
};
