const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const fs = require('fs');
const path = require('path');

const defaultConfig = getDefaultConfig(__dirname);

defaultConfig.transformer = {
  ...defaultConfig.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer'),
};
defaultConfig.resolver = {
  ...defaultConfig.resolver,
  assetExts: defaultConfig.resolver.assetExts.filter(ext => ext !== 'svg'),
  sourceExts: [...defaultConfig.resolver.sourceExts, 'svg'],
};

const rnwPath = fs.realpathSync(
  path.resolve(require.resolve('react-native-windows/package.json'), '..'),
);

const config = {
  resolver: {
    ...defaultConfig.resolver,
    platforms: ['macos', 'ios', 'android', 'windows'],
    blockList: [
      new RegExp(
        `${path.resolve(__dirname, 'windows').replace(/[/\\]/g, '/')}.*`,
      ),
      new RegExp(`${rnwPath.replace(/[/\\]/g, '/')}/build/.*`),
      new RegExp(`${rnwPath.replace(/[/\\]/g, '/')}/target/.*`),
      /.*\.ProjectImports\.zip/,
    ],
    resolveRequest: (context, moduleName, platform) => {
      if (platform === 'macos') {
        const macosModuleName =
          moduleName === 'react-native'
            ? 'react-native-macos'
            : moduleName.startsWith('react-native/')
              ? `react-native-macos/${moduleName.slice('react-native/'.length)}`
              : moduleName;

        try {
          return context.resolveRequest(context, macosModuleName, platform);
        } catch {
          return context.resolveRequest(
            {...context, platform: 'ios'},
            macosModuleName,
            'ios',
          );
        }
      }

      return context.resolveRequest(context, moduleName, platform);
    },
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};

module.exports = mergeConfig(defaultConfig, config);
