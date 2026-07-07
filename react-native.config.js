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
    '@react-native-async-storage/async-storage': {
      platforms: {
        windows: {
          sourceDir: 'windows',
          solutionFile: null,
          projects: [
            {
              projectFile:
                'ReactNativeAsyncStorage/ReactNativeAsyncStorage.vcxproj',
              directDependency: true,
            },
          ],
        },
      },
    },
    'react-native-svg': {
      platforms: {
        windows: {
          sourceDir: 'windows',
          solutionFile: null,
          projects: [
            {
              projectFile: 'RNSVG/RNSVG.vcxproj',
              directDependency: true,
            },
          ],
        },
      },
    },
    'react-native-screens': {
      platforms: {
        macos: null,
        windows: null,
      },
    },
  },
};
