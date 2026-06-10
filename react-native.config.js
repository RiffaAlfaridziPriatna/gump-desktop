module.exports = {
  project: {
    ios: {},
    android: {},
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
