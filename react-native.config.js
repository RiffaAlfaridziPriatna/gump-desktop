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
        windows: null,
      },
    },
    'react-native-safe-area-context': {
      platforms: {
        windows: null,
      },
    },
    'react-native-gesture-handler': {
      platforms: {
        windows: null,
      },
    },
    '@react-native-community/blur': {
      platforms: {
        windows: null,
      },
    },
    'react-native-image-picker': {
      platforms: {
        windows: null,
      },
    },
    '@op-engineering/op-sqlite': {
      platforms: {
        windows: null,
      },
    },
    'react-native-device-info': {
      platforms: {
        macos: null,
      },
    },
    'react-native-localize': {
      platforms: {
        windows: null,
      },
    },
  },
};
